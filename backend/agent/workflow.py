"""Core Agent workflow — two-phase: Plan → Generate, with SSE events."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator

from openai import AsyncOpenAI

from .models import AnimationRules, LlmConfig
from .prompts import SCENE_CLASS, build_planning_prompt, build_code_prompt
from .tools import (
    TOOL_DEFINITIONS,
    execute_tool,
    extract_code_from_response,
    render_animation,
    validate_syntax,
    check_manim_imports,
    WORKDIR,
)

log = logging.getLogger(__name__)


def _event(step: str, message: str) -> dict:
    return {"event": "step_start", "data": {"step": step, "message": message}}


def _extract_json_from_response(text: str) -> str:
    """Try to extract JSON from LLM response, handling markdown fences."""
    t = text.strip()
    # Try to find JSON in code fences
    m = re.search(r"```(?:json)?\s*\n(.*?)\n```", t, re.DOTALL)
    if m:
        return m.group(1).strip()
    # Try to find raw JSON object
    m = re.search(r"\{.*\}", t, re.DOTALL)
    if m:
        return m.group(0)
    return t


async def run_agent_workflow(
    prompt: str,
    llm_config: LlmConfig | None = None,
    style_analysis: str | None = None,
    rules: AnimationRules | None = None,
    max_syntax_retries: int = 3,
    max_render_retries: int = 2,
) -> AsyncGenerator[dict, None]:
    api_key = llm_config.api_key if llm_config and llm_config.api_key else None
    if not api_key:
        yield {"event": "error", "data": {"message": "未配置 API Key。请在设置中填写。", "recoverable": False}}
        return

    base_url = (llm_config.base_url if llm_config and llm_config.base_url else None)
    model = (llm_config.model if llm_config and llm_config.model else "gpt-4o-mini")

    client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)

    job_id = str(uuid.uuid4())
    job_dir = WORKDIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()

    # ══════════════════════════════════════════════════════════════
    # Phase 1: PLAN — understand the topic and design shots
    # ══════════════════════════════════════════════════════════════
    yield _event("plan", "正在分析主题并规划动画方案...")

    planning_prompt = build_planning_prompt(rules=rules, style_analysis=style_analysis)

    try:
        plan_response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": planning_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
        )
    except Exception as e:
        yield {"event": "error", "data": {"message": f"规划阶段 LLM 调用失败: {e}", "recoverable": False}}
        return

    plan_raw = plan_response.choices[0].message.content or ""
    plan_json_str = _extract_json_from_response(plan_raw)

    # Parse the plan
    try:
        plan = json.loads(plan_json_str)
        plan_title = plan.get("title", prompt[:30])
        plan_summary = plan.get("summary", "")
        shots = plan.get("shots", [])
        total_duration = plan.get("total_duration", 15)
    except json.JSONDecodeError:
        # If JSON parsing fails, use the raw text as plan
        plan = {"raw": plan_raw}
        plan_title = prompt[:30]
        plan_summary = plan_raw[:200]
        shots = []
        total_duration = 15

    yield {
        "event": "plan_ready",
        "data": {
            "title": plan_title,
            "summary": plan_summary,
            "shots": shots,
            "total_duration": total_duration,
            "raw": plan_raw,
        },
    }

    # ══════════════════════════════════════════════════════════════
    # Phase 2: GENERATE — write Manim code based on the plan
    # ══════════════════════════════════════════════════════════════
    code_prompt = build_code_prompt(
        plan=plan_raw,
        total_duration=total_duration,
        rules=rules,
        style_analysis=style_analysis,
    )

    messages: list[dict] = [
        {"role": "system", "content": code_prompt},
        {"role": "user", "content": f"请根据上面的方案，生成完整的 Manim 代码。方案标题：{plan_title}"},
    ]

    syntax_retries = 0
    render_retries = 0
    final_code = None
    video_url = None

    while True:
        # GENERATE
        yield _event("generate", "正在生成 Manim 代码...")
        t_gen = time.time()

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                temperature=0.3,
            )
        except Exception as e:
            yield {"event": "error", "data": {"message": f"代码生成 LLM 调用失败: {e}", "recoverable": False}}
            return

        # Handle tool calls
        while response.choices[0].message.tool_calls:
            assistant_msg = response.choices[0].message
            messages.append(assistant_msg.model_dump())

            for tool_call in assistant_msg.tool_calls:
                result = await execute_tool(tool_call)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })
                yield {"event": "tool_result", "data": {"tool": tool_call.function.name, "result": result}}

            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                    temperature=0.3,
                )
            except Exception as e:
                yield {"event": "error", "data": {"message": f"LLM 调用失败: {e}", "recoverable": False}}
                return

        raw_content = response.choices[0].message.content or ""
        messages.append({"role": "assistant", "content": raw_content})

        code = extract_code_from_response(raw_content)
        yield {"event": "code_generated", "data": {"code": code, "duration": round(time.time() - t_gen, 1)}}

        # VALIDATE
        yield _event("validate", "正在检查语法...")
        t_val = time.time()

        syntax_ok = validate_syntax(code)
        imports_ok = check_manim_imports(code)
        all_ok = syntax_ok["passed"] and imports_ok["valid"]

        yield {
            "event": "validation_result",
            "data": {
                "passed": all_ok,
                "syntax_error": syntax_ok.get("error"),
                "imports": imports_ok,
                "duration": round(time.time() - t_val, 1),
            },
        }

        if not all_ok:
            syntax_retries += 1
            if syntax_retries > max_syntax_retries:
                yield {"event": "error", "data": {"message": "语法验证多次失败", "recoverable": False}}
                return
            error_detail = syntax_ok.get("error") or str(imports_ok.get("checks", {}))
            messages.append({"role": "user", "content": f"生成的代码有错误：\n{error_detail}\n请修复并重新生成。"})
            yield _event("correct", f"正在修正语法（第 {syntax_retries} 次）...")
            continue

        final_code = code

        # RENDER TEST
        yield _event("render_test", "正在测试渲染...")
        t_render = time.time()

        render_result = await render_animation(code, job_id)

        yield {
            "event": "render_result",
            "data": {
                "passed": render_result["passed"],
                "error": render_result.get("error"),
                "video_url": render_result.get("video_url"),
                "duration": round(time.time() - t_render, 1),
            },
        }

        if not render_result["passed"]:
            render_retries += 1
            if render_retries > max_render_retries:
                yield {"event": "error", "data": {"message": "渲染失败，代码语法正确但渲染出错", "recoverable": False}}
                yield {"event": "complete", "data": {"code": final_code, "video_url": None, "job_id": job_id}}
                return
            error_detail = render_result.get("error", "Unknown render error")[-2000:]
            messages.append({"role": "user", "content": f"Manim 渲染错误：\n{error_detail}\n请修复代码并重新生成。"})
            yield _event("correct", f"正在修正渲染错误（第 {render_retries} 次）...")
            final_code = None
            continue

        video_url = render_result.get("video_url")
        break

    yield {
        "event": "complete",
        "data": {
            "code": final_code,
            "video_url": video_url,
            "job_id": job_id,
            "plan": plan,
            "total_duration": round(time.time() - t0, 1),
        },
    }
