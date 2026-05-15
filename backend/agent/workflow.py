"""Core Agent workflow — optimized for speed: single LLM call + syntax check."""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator

from .models import AnimationRules, LlmConfig, VisionLlmConfig
from .prompts import build_system_prompt, TEACHER_SOLVE_PROMPT, TEACHER_REFINE_PROMPT, TEACHER_TO_MANIM_PROMPT, TEACHER_DIRECT_PROMPT
from .tools import (
    extract_code_from_response,
    render_animation,
    validate_syntax,
    check_manim_imports,
    WORKDIR,
)
from .vision import extract_math_problem

log = logging.getLogger(__name__)


async def _llm_chat(
    messages: list[dict],
    model: str,
    api_key: str,
    base_url: str | None = None,
    api_format: str = "openai",
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    """Unified LLM chat call supporting both OpenAI and Anthropic formats."""
    log.info("_llm_chat - format: %s, model: %s, base_url: %s", api_format, model, base_url)
    if api_format == "anthropic":
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=api_key, base_url=base_url or None)
        # Anthropic: system prompt is a top-level param, not in messages
        system_content = ""
        user_messages = []
        for m in messages:
            if m["role"] == "system":
                system_content += m["content"] + "\n"
            else:
                user_messages.append(m)
        if not user_messages:
            user_messages = [{"role": "user", "content": "Hello"}]

        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_content.strip() or None,
            messages=user_messages,
            temperature=temperature,
        )
        # Find TextBlock, skip ThinkingBlock
        text_parts = []
        for block in response.content:
            block_text = getattr(block, "text", None)
            if block_text is not None:
                text_parts.append(block_text)
        if text_parts:
            return "\n".join(text_parts)
        # No text found — log and raise
        block_types = [getattr(block, "type", type(block).__name__) for block in response.content]
        log.error("Anthropic response has no TextBlock. Block types: %s", block_types)
        raise ValueError(f"LLM 返回无文本内容（block types: {block_types}）")
    else:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""


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
    api_format = (llm_config.api_format if llm_config and llm_config.api_format else "openai")

    log.info("LLM request - base_url: %s, model: %s, api_format: %s, api_key_len: %d", base_url, model, api_format, len(api_key or ""))

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
            raw_content = await _llm_chat(
                messages=messages,
                model=model,
                api_key=api_key,
                base_url=base_url,
                api_format=api_format,
                temperature=0.3,
            )
        except Exception as e:
            err_msg = str(e)
            # Provide helpful hints for common errors
            if "404" in err_msg or "Not Found" in err_msg:
                err_msg = f"接口返回 404 Not Found。\n\n可能原因：\n1) Base URL 不正确（当前: {base_url}）\n2) 模型名不正确（当前: {model}）\n3) 该 API 地址已变更，请到设置中检查 Provider 配置"
            elif "401" in err_msg or "403" in err_msg:
                err_msg += "\n\nAPI Key 无效或已过期，请检查设置。"
            log.error("LLM call failed: %s", e)
            yield {"event": "error", "data": {"message": f"LLM 调用失败: {err_msg}", "recoverable": False}}
            return

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
    import re as _re
    text = raw.strip()

    # Strip markdown code fences
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    text = text.strip()

    # Try direct parse first
    try:
        return _json.loads(text)
    except _json.JSONDecodeError:
        pass

    # Try to extract JSON object from surrounding text
    match = _re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return _json.loads(match.group())
        except _json.JSONDecodeError:
            pass

    log.warning("_parse_json_response failed. Raw text (first 500 chars): %s", raw[:500])
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
    phase: str = "direct",
) -> AsyncGenerator[dict, None]:
    api_key = llm_config.api_key if llm_config and llm_config.api_key else None
    if not api_key:
        yield {"event": "error", "data": {"message": "未配置 API Key。请在设置中填写。", "recoverable": False}}
        return

    base_url = llm_config.base_url if llm_config and llm_config.base_url else None
    model = llm_config.model if llm_config and llm_config.model else "gpt-4o-mini"
    api_format = (llm_config.api_format if llm_config and llm_config.api_format else "openai")

    log.info("Teacher LLM request - base_url: %s, model: %s, api_format: %s, api_key_len: %d", base_url, model, api_format, len(api_key or ""))

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
            # Guess correct vision model based on provider base URL
            _url = (base_url or "").lower()
            if "dashscope" in _url or "aliyuncs" in _url:
                _vision_model = "qwen-vl-max"
            elif "bigmodel.cn" in _url:
                _vision_model = "glm-4v"
            elif "siliconflow" in _url:
                _vision_model = "Qwen/Qwen2-VL-72B-Instruct"
            else:
                _vision_model = "gpt-4o"
            vision_config = VisionLlmConfig(api_key=api_key, base_url=base_url, model=_vision_model)

        import base64 as _b64
        image_bytes = _b64.b64decode(image_base64)

        result = await extract_math_problem(image_bytes, content_type, vision_config)
        if "error" in result:
            yield {"event": "error", "data": {"message": f"题目识别失败：{result['error']}", "recoverable": False}}
            return
        problem_text = result.get("problem_text", "")
        if not problem_text:
            yield {"event": "error", "data": {"message": "无法识别题目内容。请检查视觉模型配置是否正确（模型需支持图像输入）。", "recoverable": False}}
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

    if refinement and not session_data:
        log.warning("Refinement requested but no session found (session_id=%s)", session_id)
        # Don't silently fail — but continue with code generation using problem_text

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
            raw = await _llm_chat(messages=messages, model=model, api_key=api_key, base_url=base_url, api_format=api_format, temperature=0.3, max_tokens=8192)
            log.info("REFINE raw response (first 500): %s", raw[:500])
            solution_data = _parse_json_response(raw)
        except Exception as e:
            err_msg = str(e)
            if "404" in err_msg or "Not Found" in err_msg:
                err_msg = f"接口返回 404 Not Found。请检查 Base URL（{base_url}）和模型名（{model}）是否正确。"
            yield {"event": "error", "data": {"message": f"修正失败: {err_msg}", "recoverable": False}}
            return

        if not solution_data:
            log.error("REFINE JSON parse failed. Raw (first 800): %s", raw[:800])
            yield {"event": "error", "data": {"message": f"修正结果解析失败。LLM 返回内容（前200字）：{raw[:200]}", "recoverable": False}}
            return

        yield {
            "event": "solution_refined",
            "data": {
                "steps": solution_data.get("solution", []),
                "summary": solution_data.get("summary", ""),
                "refinement_applied": refinement,
            },
        }
    elif phase == "direct":
        # Direct mode: skip solve, go straight to code generation
        pass
    else:
        # Phase 2: SOLVE
        yield _event("solve", "正在分析解题步骤...")

        solve_msg = TEACHER_SOLVE_PROMPT.format(problem_text=problem_text)
        messages = [
            {"role": "system", "content": "你是一个数学解题专家。只输出 JSON。"},
            {"role": "user", "content": solve_msg},
        ]

        try:
            raw = await _llm_chat(messages=messages, model=model, api_key=api_key, base_url=base_url, api_format=api_format, temperature=0.3, max_tokens=8192)
            log.info("SOLVE raw response (first 500): %s", raw[:500])
            solution_data = _parse_json_response(raw)
        except Exception as e:
            err_msg = str(e)
            if "404" in err_msg or "Not Found" in err_msg:
                err_msg = f"接口返回 404 Not Found。请检查 Base URL（{base_url}）和模型名（{model}）是否正确。"
            yield {"event": "error", "data": {"message": f"解题失败: {err_msg}", "recoverable": False}}
            return

        if not solution_data:
            log.error("SOLVE JSON parse failed. Raw (first 800): %s", raw[:800])
            yield {"event": "error", "data": {"message": f"解题结果解析失败。LLM 返回内容（前200字）：{raw[:200]}", "recoverable": False}}
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

    if phase == "direct" or not solution_data:
        gen_prompt = TEACHER_DIRECT_PROMPT.format(problem_text=problem_text)
    else:
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
        raw_content = await _llm_chat(
            messages=gen_messages, model=model, api_key=api_key,
            base_url=base_url, api_format=api_format, temperature=0.3,
        )
    except Exception as e:
        err_msg = str(e)
        if "404" in err_msg or "Not Found" in err_msg:
            err_msg = f"接口返回 404 Not Found。\n\n可能原因：\n1) Base URL 不正确（当前: {base_url}）\n2) 模型名不正确（当前: {model}）\n3) 该 API 地址已变更，请到设置中检查 Provider 配置"
        elif "401" in err_msg or "403" in err_msg:
            err_msg += "\n\nAPI Key 无效或已过期，请检查设置。"
        log.error("LLM call failed: %s", e)
        yield {"event": "error", "data": {"message": f"LLM 调用失败: {err_msg}", "recoverable": False}}
        return
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
            raw_content = await _llm_chat(
                messages=gen_messages, model=model, api_key=api_key,
                base_url=base_url, api_format=api_format, temperature=0.3,
            )
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

    # Save code
    script_path = job_dir / "scene.py"
    script_path.write_text(code, encoding="utf-8")

    # ── Done: return code, user clicks "生成动画" to render separately ──
    yield {
        "event": "complete",
        "data": {
            "code": code,
            "video_url": None,
            "job_id": job_id,
            "session_id": new_session_id,
            "total_duration": round(time.time() - t0, 1),
        },
    }
