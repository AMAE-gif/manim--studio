"""Core Agent workflow — optimized for speed: single LLM call + syntax check."""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator

from openai import AsyncOpenAI

from .models import AnimationRules, LlmConfig
from .prompts import build_system_prompt
from .tools import (
    extract_code_from_response,
    render_animation,
    validate_syntax,
    check_manim_imports,
    WORKDIR,
)

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
