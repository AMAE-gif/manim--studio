"""Core Agent workflow — optimized for speed: single LLM call + syntax check."""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator

from openai import AsyncOpenAI

from .models import AnimationRules, LlmConfig, VisionLlmConfig
from .prompts import build_system_prompt, TEACHER_SOLVE_PROMPT, TEACHER_REFINE_PROMPT, TEACHER_TO_MANIM_PROMPT
from .tools import (
    extract_code_from_response,
    render_animation,
    validate_syntax,
    check_manim_imports,
    WORKDIR,
)
from .vision import extract_math_problem

log = logging.getLogger(__name__)


def _event(step: str, message: str) -> dict:
    return {"event": "step_start", "data": {"step": step, "message": message}}


async def run_agent_workflow(
    prompt: str,
    llm_config: LlmConfig | None = None,
    style_analysis: str | None = None,
    rules: AnimationRules | None = None,
    max_syntax_retries: int = 1,
    max_render_retries: int = 0,
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

    system_prompt = build_system_prompt(rules=rules, style_analysis=style_analysis)
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    t0 = time.time()

    # Single LLM call (with max 1 retry on syntax error)
    for attempt in range(max_syntax_retries + 1):
        # GENERATE
        if attempt == 0:
            yield _event("generate", "正在生成代码...")
        else:
            yield _event("correct", f"正在修正代码（第 {attempt} 次）...")

        t_gen = time.time()

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.3,
            )
        except Exception as e:
            yield {"event": "error", "data": {"message": f"LLM 调用失败: {e}", "recoverable": False}}
            return

        raw_content = response.choices[0].message.content or ""

        code = extract_code_from_response(raw_content)
        yield {"event": "code_generated", "data": {"code": code, "duration": round(time.time() - t_gen, 1)}}

        # VALIDATE (fast, no LLM call)
        yield _event("validate", "正在检查语法...")

        syntax_ok = validate_syntax(code)
        imports_ok = check_manim_imports(code)
        all_ok = syntax_ok["passed"] and imports_ok["valid"]

        yield {
            "event": "validation_result",
            "data": {
                "passed": all_ok,
                "syntax_error": syntax_ok.get("error"),
                "imports": imports_ok,
            },
        }

        if all_ok:
            break

        # Syntax error — feed back to LLM for one retry
        if attempt < max_syntax_retries:
            error_detail = syntax_ok.get("error") or str(imports_ok.get("checks", {}))
            messages.append({"role": "assistant", "content": raw_content})
            messages.append({"role": "user", "content": f"代码有语法错误：\n{error_detail}\n请只输出修复后的完整 Python 代码。"})
        else:
            yield {"event": "error", "data": {"message": f"语法错误: {syntax_ok.get('error', 'unknown')}", "recoverable": False}}
            return

    # Save code to job dir
    script_path = job_dir / "scene.py"
    script_path.write_text(code, encoding="utf-8")

    # RENDER (background, non-blocking for the user)
    yield _event("render_test", "正在渲染视频...")
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

    video_url = render_result.get("video_url") if render_result["passed"] else None

    yield {
        "event": "complete",
        "data": {
            "code": code,
            "video_url": video_url,
            "job_id": job_id,
            "total_duration": round(time.time() - t0, 1),
        },
    }


# ── Teacher Mode Workflow ──

# In-memory teacher session store
_teacher_sessions: dict[str, dict] = {}


def _get_teacher_session(session_id: str) -> dict | None:
    return _teacher_sessions.get(session_id)


def _save_teacher_session(session_id: str, data: dict) -> None:
    _teacher_sessions[session_id] = data


def _parse_json_response(raw: str) -> dict | None:
    import json as _json
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    text = text.strip()
    try:
        return _json.loads(text)
    except _json.JSONDecodeError:
        return None


async def run_teacher_workflow(
    image_base64: str | None = None,
    content_type: str = "image/png",
    prompt: str = "",
    llm_config: LlmConfig | None = None,
    vision_llm_config: VisionLlmConfig | None = None,
    rules: AnimationRules | None = None,
    style_analysis: str | None = None,
    session_id: str | None = None,
    refinement: str | None = None,
    step_index: int | None = None,
) -> AsyncGenerator[dict, None]:
    api_key = llm_config.api_key if llm_config and llm_config.api_key else None
    if not api_key:
        yield {"event": "error", "data": {"message": "未配置 API Key。请在设置中填写。", "recoverable": False}}
        return

    base_url = llm_config.base_url if llm_config and llm_config.base_url else None
    model = llm_config.model if llm_config and llm_config.model else "gpt-4o-mini"

    client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)

    job_id = str(uuid.uuid4())
    job_dir = WORKDIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()

    # ── Phase 1: EXTRACT (if image provided and no session) ──
    problem_text = ""
    session_data = None

    if session_id:
        session_data = _get_teacher_session(session_id)
        if session_data:
            problem_text = session_data.get("problem_text", "")

    if not problem_text and image_base64:
        yield _event("extract", "正在识别题目...")

        vision_config = vision_llm_config or VisionLlmConfig()
        if not vision_config.api_key:
            vision_config = VisionLlmConfig(api_key=api_key, base_url=base_url, model="gpt-4o")

        import base64 as _b64
        image_bytes = _b64.b64decode(image_base64)

        result = await extract_math_problem(image_bytes, content_type, vision_config)
        problem_text = result.get("problem_text", "")
        if not problem_text:
            yield {"event": "error", "data": {"message": "无法识别题目内容。", "recoverable": False}}
            return

        yield {
            "event": "problem_extracted",
            "data": {
                "problem_text": problem_text,
                "problem_type": result.get("problem_type", ""),
                "expressions": result.get("expressions", []),
                "visual_elements": result.get("visual_elements", []),
            },
        }

    if not problem_text and prompt:
        problem_text = prompt

    if not problem_text:
        yield {"event": "error", "data": {"message": "请提供题目图片或文字描述。", "recoverable": False}}
        return

    # ── Phase 2 or 3: SOLVE or REFINE ──
    solution_data = None

    if refinement and session_data:
        # Phase 3: REFINE
        yield _event("refine", "正在根据反馈修改解法...")

        step_ctx = ""
        if step_index is not None:
            step_ctx = f"请重点修改第 {step_index + 1} 步。"

        refine_msg = TEACHER_REFINE_PROMPT.format(
            current_solution=json.dumps(session_data.get("solution", {}), ensure_ascii=False, indent=2),
            teacher_instruction=refinement,
            step_context=step_ctx,
        )

        messages = [
            {"role": "system", "content": "你是一个数学解题专家。只输出 JSON。"},
            {"role": "user", "content": refine_msg},
        ]

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.3,
            )
            raw = response.choices[0].message.content or ""
            solution_data = _parse_json_response(raw)
        except Exception as e:
            yield {"event": "error", "data": {"message": f"修正失败: {e}", "recoverable": False}}
            return

        if not solution_data:
            yield {"event": "error", "data": {"message": "修正结果解析失败。", "recoverable": False}}
            return

        yield {
            "event": "solution_refined",
            "data": {
                "steps": solution_data.get("solution", []),
                "summary": solution_data.get("summary", ""),
                "refinement_applied": refinement,
            },
        }
    else:
        # Phase 2: SOLVE
        yield _event("solve", "正在分析解题步骤...")

        solve_msg = TEACHER_SOLVE_PROMPT.format(problem_text=problem_text)
        messages = [
            {"role": "system", "content": "你是一个数学解题专家。只输出 JSON。"},
            {"role": "user", "content": solve_msg},
        ]

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.3,
            )
            raw = response.choices[0].message.content or ""
            solution_data = _parse_json_response(raw)
        except Exception as e:
            yield {"event": "error", "data": {"message": f"解题失败: {e}", "recoverable": False}}
            return

        if not solution_data:
            yield {"event": "error", "data": {"message": "解题结果解析失败。", "recoverable": False}}
            return

        yield {
            "event": "solution_ready",
            "data": {
                "steps": solution_data.get("solution", []),
                "summary": solution_data.get("summary", ""),
                "visual_summary": solution_data.get("visual_summary", ""),
            },
        }

    # Save session
    new_session_id = session_id or str(uuid.uuid4())
    _save_teacher_session(new_session_id, {
        "problem_text": problem_text,
        "solution": solution_data,
    })

    # ── Phase 4: GENERATE Manim code ──
    yield _event("generate", "正在生成 Manim 动画代码...")

    gen_prompt = TEACHER_TO_MANIM_PROMPT.format(
        problem_text=problem_text,
        solution_json=json.dumps(solution_data, ensure_ascii=False, indent=2),
    )

    system_prompt = build_system_prompt(rules=rules, style_analysis=style_analysis)
    gen_messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": gen_prompt},
    ]

    t_gen = time.time()
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=gen_messages,
            temperature=0.3,
        )
    except Exception as e:
        yield {"event": "error", "data": {"message": f"LLM 调用失败: {e}", "recoverable": False}}
        return

    raw_content = response.choices[0].message.content or ""
    code = extract_code_from_response(raw_content)
    yield {"event": "code_generated", "data": {"code": code, "duration": round(time.time() - t_gen, 1)}}

    # Validate
    yield _event("validate", "正在检查语法...")
    syntax_ok = validate_syntax(code)
    imports_ok = check_manim_imports(code)
    all_ok = syntax_ok["passed"] and imports_ok["valid"]

    yield {
        "event": "validation_result",
        "data": {
            "passed": all_ok,
            "syntax_error": syntax_ok.get("error"),
            "imports": imports_ok,
        },
    }

    if not all_ok:
        # One retry
        error_detail = syntax_ok.get("error") or str(imports_ok.get("checks", {}))
        gen_messages.append({"role": "assistant", "content": raw_content})
        gen_messages.append({"role": "user", "content": f"代码有语法错误：\n{error_detail}\n请只输出修复后的完整 Python 代码。"})

        yield _event("correct", "正在修正代码...")
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=gen_messages,
                temperature=0.3,
            )
            raw_content = response.choices[0].message.content or ""
            code = extract_code_from_response(raw_content)
            yield {"event": "code_generated", "data": {"code": code, "duration": 0}}

            syntax_ok = validate_syntax(code)
            imports_ok = check_manim_imports(code)
            all_ok = syntax_ok["passed"] and imports_ok["valid"]

            yield {
                "event": "validation_result",
                "data": {"passed": all_ok, "syntax_error": syntax_ok.get("error"), "imports": imports_ok},
            }
        except Exception as e:
            yield {"event": "error", "data": {"message": f"修正失败: {e}", "recoverable": False}}
            return

    if not all_ok:
        yield {"event": "error", "data": {"message": f"语法错误: {syntax_ok.get('error', 'unknown')}", "recoverable": False}}
        return

    # Save and render
    script_path = job_dir / "scene.py"
    script_path.write_text(code, encoding="utf-8")

    yield _event("render_test", "正在渲染视频...")
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

    video_url = render_result.get("video_url") if render_result["passed"] else None

    yield {
        "event": "complete",
        "data": {
            "code": code,
            "video_url": video_url,
            "job_id": job_id,
            "session_id": new_session_id,
            "total_duration": round(time.time() - t0, 1),
        },
    }
