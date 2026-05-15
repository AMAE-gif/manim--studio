"""
在线 Manim：自然语言生成场景代码并渲染为视频预览。
可选：Supabase（项目表 + Storage MP4）；自定义前端域名通过环境变量 ALLOWED_ORIGINS。
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field

from agent import analyze_image_style, run_agent_workflow, run_teacher_workflow, submit_job, get_job, get_queue_info
from agent.models import AgentGenerateBody, VisionLlmConfig, TeacherModeSubmit

from supabase_sync import (
    decode_user_id_from_jwt,
    get_project_for_user,
    get_supabase_admin,
    insert_project,
    list_user_projects,
    parse_bearer_header,
    public_object_url,
    update_project_code,
    update_project_rendered,
    upload_render_mp4,
)

log = logging.getLogger(__name__)
_start_time = time.time()

SCENE_CLASS = "GeneratedScene"

SYSTEM_PROMPT = f"""你是 Manim Community Edition 专家。用户用自然语言描述动画，你输出**完整可运行**的 Python 文件内容。

硬性要求：
1. 第一行必须是：from manim import *
2. 必须定义 class {SCENE_CLASS}(Scene):
3. 只使用 manim 社区版公开 API，不要虚构类名。
4. construct(self) 内完成动画；总时长尽量控制在 15 秒以内（用 self.wait 控制）。
5. 不要 markdown 代码块，不要解释文字，只输出纯 Python 源码。
6. 使用较快的默认：简单图形、Text/Markup 时注意字号适中（约 36–48）。
7. 若需要数学公式，优先使用 MathTex 或 Tex，避免不存在的 LaTeX 包。
8. 中文文字必须用 Text()，绝对不能把中文放进 MathTex/Tex（LaTeX 不支持 Unicode 中文，会编译失败）。
"""


def _allowed_cors_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    extra = [x.strip() for x in raw.split(",") if x.strip()]
    base = ["http://localhost:5173", "http://127.0.0.1:5173"]
    merged = base + extra
    return list(dict.fromkeys(merged))


app = FastAPI(title="Manim NL Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKDIR = Path(__file__).resolve().parent / "renders"
WORKDIR.mkdir(exist_ok=True)


def get_optional_user(authorization: str | None = Header(default=None)) -> UUID | None:
    token = parse_bearer_header(authorization)
    if not token:
        return None
    return decode_user_id_from_jwt(token)


def get_required_user(authorization: str | None = Header(default=None)) -> UUID:
    token = parse_bearer_header(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="请先登录（Supabase）")
    uid = decode_user_id_from_jwt(token)
    if uid is None:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    return uid


class LlmConfig(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_format: str = "openai"  # "openai" or "anthropic"


class GenerateBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    llm: LlmConfig | None = None
    code: str | None = None  # Pre-generated code from frontend (skip LLM call)


class GenerateResponse(BaseModel):
    code: str
    job_id: str
    video_url: str | None = None
    render_error: str | None = None


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:python)?\s*", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s*```\s*$", "", t)
    return t.strip()


def _ensure_scene(code: str) -> str:
    if SCENE_CLASS not in code:
        raise ValueError(f"模型输出必须包含 class {SCENE_CLASS}(Scene)")
    if "from manim import" not in code:
        raise ValueError("必须包含 from manim import")
    return code


async def generate_manim_code(user_prompt: str, llm: LlmConfig | None = None) -> str:
    from agent.workflow import _llm_chat
    from agent.tools import validate_syntax, check_manim_imports

    api_key = (llm.api_key if llm and llm.api_key else None) or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="未配置 API Key。请在设置中填写你的 LLM API Key，或在后端环境变量中设置 OPENAI_API_KEY。",
        )
    base_url = (llm.base_url if llm and llm.base_url else None) or os.environ.get("OPENAI_BASE_URL")
    model = (llm.model if llm and llm.model else None) or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    api_format = (llm.api_format if llm and llm.api_format else "openai")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    # Generate + validate loop (max 2 attempts)
    raw = None
    code = None
    for attempt in range(2):
        try:
            raw = await _llm_chat(
                messages=messages, model=model, api_key=api_key,
                base_url=base_url, api_format=api_format, temperature=0.3,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM 调用失败: {e!s}") from e

        code = _strip_code_fences(raw)

        # Validate syntax and imports
        syntax = validate_syntax(code)
        imports = check_manim_imports(code)
        if syntax["passed"] and imports["valid"]:
            break  # Code is valid

        # If first attempt failed, retry with error feedback
        if attempt == 0:
            error_detail = syntax.get("error") or str(imports.get("checks", {}))
            messages.append({"role": "assistant", "content": raw})
            messages.append({"role": "user", "content": f"代码有语法错误：\n{error_detail}\n请只输出修复后的完整 Python 代码。"})
            continue

    try:
        return _ensure_scene(code)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


def find_manim_video(job_dir: Path) -> Path | None:
    media = job_dir / "media" / "videos"
    if not media.exists():
        return None
    mp4s = sorted(media.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    return mp4s[0] if mp4s else None


@app.post("/api/generate", response_model=GenerateResponse)
async def api_generate(
    body: GenerateBody,
    user_id: UUID | None = Depends(get_optional_user),
):
    from agent.tools import validate_syntax, check_manim_imports, render_animation
    from agent.workflow import _llm_chat

    api_key = (body.llm.api_key if body.llm and body.llm.api_key else None) or os.environ.get("OPENAI_API_KEY")
    base_url = (body.llm.base_url if body.llm and body.llm.base_url else None) or os.environ.get("OPENAI_BASE_URL")
    model = (body.llm.model if body.llm and body.llm.model else None) or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    api_format = (body.llm.api_format if body.llm and body.llm.api_format else "openai")

    # Step 1: Get code (generate or use pre-generated)
    if body.code:
        code = _strip_code_fences(body.code)
        try:
            code = _ensure_scene(code)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    else:
        code = await generate_manim_code(body.prompt, body.llm)

    job_id = str(uuid.uuid4())
    job_dir = WORKDIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    script_path = job_dir / "scene.py"

    # Step 2: Syntax validate + auto-fix loop
    for syntax_attempt in range(3):  # max 3 attempts
        syntax = validate_syntax(code)
        imports = check_manim_imports(code)
        if syntax["passed"] and imports["valid"]:
            break

        # Syntax error — try to fix with LLM
        error_detail = syntax.get("error") or str(imports.get("checks", {}))
        log.warning("Syntax error (attempt %d): %s", syntax_attempt + 1, error_detail[:200])
        if api_key and api_key != "__direct__":
            # Use fresh messages for each fix attempt
            fix_msgs = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": body.prompt},
                {"role": "assistant", "content": code},
                {"role": "user", "content": f"代码有语法错误：\n{error_detail}\n\n请修复语法错误，只输出完整的修复后 Python 代码。"},
            ]
            try:
                raw = await _llm_chat(messages=fix_msgs, model=model, api_key=api_key, base_url=base_url, api_format=api_format, temperature=0.3)
                code = _strip_code_fences(raw)
                code = _ensure_scene(code)
            except Exception as e:
                log.error("Syntax fix LLM call failed: %s", e)
                break
        else:
            break

    # Final syntax check
    syntax = validate_syntax(code)
    imports = check_manim_imports(code)
    if not syntax["passed"] or not imports["valid"]:
        error = syntax.get("error") or str(imports.get("checks", {}))
        raise HTTPException(status_code=422, detail=f"代码语法错误（自动修复失败）: {error}")

    script_path.write_text(code, encoding="utf-8")

    # Step 3: Render + auto-fix loop
    video_url = None
    render_error = None
    for render_attempt in range(3):  # max 3 attempts
        result = await render_animation(code, job_id)
        if result["passed"]:
            video_url = result.get("video_url")
            break

        # Render failed — try auto-fix
        error_msg = result.get("error", "Unknown error")[-2000:]
        render_error = error_msg[-500:]  # Store last 500 chars for response
        log.warning("Render failed (attempt %d), auto-fixing: %s", render_attempt + 1, error_msg[:300])
        if api_key and api_key != "__direct__":
            # Use fresh messages for each fix attempt
            fix_msgs = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": body.prompt},
                {"role": "assistant", "content": code},
                {"role": "user", "content": f"渲染失败，错误信息：\n{error_msg}\n\n请修复代码，只输出完整 Python 代码。常见问题：\n1. 不要在 MathTex 中使用中文（用 Text()）\n2. 确保所有变量已定义\n3. 使用 manim 社区版 API"},
            ]
            try:
                raw = await _llm_chat(messages=fix_msgs, model=model, api_key=api_key, base_url=base_url, api_format=api_format, temperature=0.3)
                code = _strip_code_fences(raw)
                code = _ensure_scene(code)
                script_path.write_text(code, encoding="utf-8")

                # Validate syntax after fix before re-rendering
                syntax = validate_syntax(code)
                if not syntax["passed"]:
                    log.warning("Fixed code has syntax error, skipping re-render")
                    continue
            except Exception as e:
                log.error("Render fix LLM call failed: %s", e)
                break
        else:
            break

    sb = get_supabase_admin()
    if sb is not None and user_id is not None:
        try:
            insert_project(
                sb,
                user_id=user_id,
                job_id=job_id,
                prompt=body.prompt,
                code=code,
            )
        except Exception as e:
            log.warning("Supabase insert_project 失败（仍返回本地 job）: %s", e)

    return GenerateResponse(code=code, job_id=job_id, video_url=video_url, render_error=render_error)


class RenderBody(BaseModel):
    job_id: str
    code: str | None = None
    llm: LlmConfig | None = None


@app.post("/api/render")
async def api_render(
    body: RenderBody,
    user_id: UUID | None = Depends(get_optional_user),
):
    """Render with auto-fix — returns SSE stream so the connection never times out."""
    import json as _json

    def _sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"

    async def _stream():
        from agent.tools import render_animation
        from agent.workflow import _llm_chat

        log.info("=== api_render CALLED job_id=%s ===", body.job_id)

        try:
            job_dir = WORKDIR / body.job_id
            if not job_dir.is_dir():
                yield _sse("error", {"message": "job_id 不存在，请先生成代码"})
                return

            script_path = job_dir / "scene.py"
            if body.code is not None:
                try:
                    script_path.write_text(_ensure_scene(_strip_code_fences(body.code)), encoding="utf-8")
                except ValueError as e:
                    yield _sse("error", {"message": str(e)})
                    return

            code = script_path.read_text(encoding="utf-8")

            api_key = (body.llm.api_key if body.llm and body.llm.api_key else None) or os.environ.get("OPENAI_API_KEY")
            base_url = (body.llm.base_url if body.llm and body.llm.base_url else None) or os.environ.get("OPENAI_BASE_URL")
            model = (body.llm.model if body.llm and body.llm.model else None) or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
            api_format = (body.llm.api_format if body.llm and body.llm.api_format else "openai")

            sb = get_supabase_admin()
            if sb is not None and user_id is not None:
                try:
                    update_project_code(sb, body.job_id, code)
                except Exception as e:
                    log.warning("Supabase update_project_code 失败: %s", e)

            result = None
            for attempt in range(3):
                yield _sse("step_start", {"step": "render", "message": f"渲染中（第 {attempt+1} 次）..."})
                result = await render_animation(code, body.job_id)
                if result["passed"]:
                    yield _sse("step_end", {"step": "render", "passed": True})
                    break

                error_msg = result.get("error", "Unknown error")
                log.warning("[attempt %d/3] 渲染失败: %s", attempt + 1, error_msg[:500])
                yield _sse("step_end", {"step": "render", "passed": False, "error": error_msg[-500:]})

                if not api_key or api_key == "__direct__":
                    break

                # Auto-fix with LLM
                from agent.tools import validate_syntax
                yield _sse("step_start", {"step": "fix", "message": f"LLM 修复中（第 {attempt+1} 次）..."})

                err_lines = error_msg.strip().split("\n")
                key_err = "\n".join(err_lines[-15:]) if len(err_lines) > 15 else error_msg

                fix_prompt = (
                    f"以下 Manim 代码渲染失败，请修复并输出完整 Python 代码。\n\n"
                    f"=== 错误 ===\n{key_err[-3000:]}\n\n"
                    f"=== 代码 ===\n{code}\n\n"
                    f"要求：只输出代码。中文用 Text()，MathTex 只用纯 LaTeX。"
                )
                fix_msgs = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": fix_prompt},
                ]
                try:
                    raw = await _llm_chat(messages=fix_msgs, model=model, api_key=api_key, base_url=base_url, api_format=api_format, temperature=0.3, max_tokens=16384)
                    log.info("[attempt %d/3] LLM fix: %d chars", attempt + 1, len(raw or ""))
                    if not raw or not raw.strip():
                        yield _sse("step_end", {"step": "fix", "passed": False, "error": "LLM 返回空"})
                        continue
                    new_code = _strip_code_fences(raw)
                    syntax = validate_syntax(new_code)
                    if not syntax["passed"]:
                        yield _sse("step_end", {"step": "fix", "passed": False, "error": syntax["error"]})
                        code = new_code
                        script_path.write_text(code, encoding="utf-8")
                        continue
                    new_code = _ensure_scene(new_code)
                    code = new_code
                    script_path.write_text(code, encoding="utf-8")
                    yield _sse("step_end", {"step": "fix", "passed": True})
                except Exception as e:
                    log.error("[attempt %d/3] LLM 修复失败: %s", attempt + 1, e)
                    yield _sse("step_end", {"step": "fix", "passed": False, "error": str(e)})
                    continue

            if not result or not result["passed"]:
                error_msg = (result.get("error", "未知错误") if result else "未知错误")
                lines = error_msg.strip().split("\n")
                key_lines = [l for l in lines if any(k in l for k in ["Error", "error", "LaTeX", "dvisvgm", "ValueError", "raise"])]
                summary = "\n".join(key_lines[-5:]) if key_lines else "\n".join(lines[-8:])
                yield _sse("error", {"message": f"渲染失败（已尝试 {attempt + 1} 次）:\n{summary[-1000:]}"})
                return

            video_url = result.get("video_url")
            video = find_manim_video(job_dir)
            final_url = video_url
            if sb is not None and user_id is not None and video:
                storage_path = f"{user_id}/{body.job_id}.mp4"
                try:
                    upload_render_mp4(sb, video, storage_path)
                    update_project_rendered(sb, body.job_id, storage_path)
                    final_url = public_object_url(storage_path)
                except Exception as e:
                    log.warning("Supabase 上传失败: %s", e)

            yield _sse("complete", {"video_url": final_url})

        except Exception as e:
            import traceback as _tb
            log.error("api_render error: %s\n%s", e, _tb.format_exc())
            yield _sse("error", {"message": f"渲染错误: {e}"})

    return StreamingResponse(_stream(), media_type="text/event-stream")


@app.get("/api/video/{job_id}")
def api_video(job_id: str):
    job_dir = WORKDIR / job_id
    found = find_manim_video(job_dir)
    if not found or not found.is_file():
        raise HTTPException(status_code=404, detail="视频不存在或已清理")
    return FileResponse(
        path=str(found),
        media_type="video/mp4",
        filename=f"preview_{job_id}.mp4",
    )


@app.delete("/api/job/{job_id}")
def api_delete_job(job_id: str):
    job_dir = WORKDIR / job_id
    if job_dir.is_dir():
        shutil.rmtree(job_dir, ignore_errors=True)
    return {"ok": True}


@app.get("/api/projects")
def api_projects(user_id: UUID = Depends(get_required_user)):
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(status_code=503, detail="服务器未配置 Supabase Service Role")
    return {"items": list_user_projects(sb, user_id)}


@app.get("/api/project/{job_id}")
def api_project_detail(job_id: str, user_id: UUID = Depends(get_required_user)):
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(status_code=503, detail="服务器未配置 Supabase Service Role")
    row = get_project_for_user(sb, user_id, job_id)
    if row is None:
        raise HTTPException(status_code=404, detail="未找到该项目")
    return row


class RenameBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)


@app.patch("/api/project/{job_id}")
def api_rename_project(job_id: str, body: RenameBody, user_id: UUID = Depends(get_required_user)):
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(status_code=503, detail="服务器未配置 Supabase Service Role")
    sb.table("manim_projects").update({"prompt": body.prompt}).eq("job_id", job_id).eq("user_id", str(user_id)).execute()
    return {"ok": True}


@app.delete("/api/project/{job_id}")
def api_delete_project(job_id: str, user_id: UUID = Depends(get_required_user)):
    sb = get_supabase_admin()
    if sb is None:
        raise HTTPException(status_code=503, detail="服务器未配置 Supabase Service Role")
    row = get_project_for_user(sb, user_id, job_id)
    if row and row.get("storage_object_path"):
        try:
            sb.storage.from_("renders").remove([row["storage_object_path"]])
        except Exception:
            pass
    sb.table("manim_projects").delete().eq("job_id", job_id).eq("user_id", str(user_id)).execute()
    job_dir = WORKDIR / job_id
    if job_dir.is_dir():
        shutil.rmtree(job_dir, ignore_errors=True)
    return {"ok": True}


@app.on_event("startup")
async def log_cors_origins():
    log.info("CORS allowed origins: %s", _allowed_cors_origins())


@app.get("/api/health")
def health():
    has_key = bool(os.environ.get("OPENAI_API_KEY"))
    manim_ok = shutil.which("manim") is not None
    sb = get_supabase_admin()
    checks = {
        "llm_configured": has_key,
        "llm_client_configurable": True,
        "manim_cli": manim_ok,
        "supabase_service_configured": sb is not None,
        "supabase_jwt_configured": bool((os.environ.get("SUPABASE_JWT_SECRET") or "").strip()),
    }
    all_ok = manim_ok and (sb is not None)
    return {
        "status": "healthy" if all_ok else "degraded",
        "uptime_seconds": int(time.time() - _start_time),
        **checks,
    }


@app.get("/api/config")
def api_config():
    """Return public config for the frontend (Supabase URL + anon key)."""
    url = os.environ.get("SUPABASE_URL", "")
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    # Fallback: if anon key not set, use service role key (works but not recommended)
    if not anon:
        anon = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return {
        "supabase_url": url,
        "supabase_anon_key": anon,
    }


@app.get("/api/debug-env")
def debug_env():
    """Temporary: check which env vars exist (length only, no secrets)."""
    vars_to_check = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET", "ALLOWED_ORIGINS"]
    result = {v: len(os.environ.get(v, "")) for v in vars_to_check}
    result["cors_origins"] = _allowed_cors_origins()
    return result


@app.post("/api/debug-llm")
async def debug_llm(body: dict):
    """Debug: test LLM connection with a simple request."""
    import traceback
    base_url = body.get("base_url", "")
    api_key = body.get("api_key", "")
    model = body.get("model", "")
    api_format = body.get("api_format", "openai")
    log.info("Debug LLM - base_url: %s, model: %s, api_format: %s, api_key_len: %d", base_url, model, api_format, len(api_key))

    try:
        if api_format == "anthropic":
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=api_key, base_url=base_url or None, timeout=30.0)
            response = await client.messages.create(
                model=model,
                max_tokens=50,
                messages=[{"role": "user", "content": "say hello"}],
            )
            return {"ok": True, "reply": response.content[0].text, "model_used": model}
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=base_url or None, timeout=30.0)
            response = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "say hello"}],
                max_tokens=50,
            )
            return {"ok": True, "reply": response.choices[0].message.content, "model_used": model}
    except Exception as e:
        tb = traceback.format_exc()
        log.error("Debug LLM failed: %s\n%s", e, tb)
        return {"ok": False, "error": str(e), "traceback": tb}


@app.post("/api/debug-vision")
async def debug_vision(
    file: UploadFile,
    vision_llm: str = "{}",
):
    """Debug: test vision model with a simple request."""
    import json as _json
    import traceback
    config = VisionLlmConfig.model_validate_json(vision_llm)
    image_bytes = await file.read()

    # Log config (no secrets)
    log.info("Debug vision - model: %s, base_url: %s, api_key_len: %d, image_size: %d",
             config.model, config.base_url, len(config.api_key or ""), len(image_bytes))

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url or None,
            timeout=30.0,
        )
        response = await client.chat.completions.create(
            model=config.model or "gpt-4o",
            messages=[{"role": "user", "content": "say hello"}],
            max_tokens=50,
        )
        return {"ok": True, "reply": response.choices[0].message.content, "model_used": config.model}
    except Exception as e:
        tb = traceback.format_exc()
        log.error("Debug vision failed: %s\n%s", e, tb)
        return {"ok": False, "error": str(e), "traceback": tb}


# ── Agent 工作流端点 ──────────────────────────────────────────────


@app.post("/api/agent/generate")
async def api_agent_generate(body: AgentGenerateBody):
    import json as _json

    async def event_generator():
        async for event in run_agent_workflow(
            prompt=body.prompt,
            llm_config=body.llm,
            style_analysis=body.style_analysis,
            rules=body.rules,
            max_syntax_retries=body.max_retries,
            max_render_retries=max(1, body.max_retries - 1),
        ):
            event_type = event["event"]
            event_data = _json.dumps(event["data"], ensure_ascii=False)
            yield f"event: {event_type}\ndata: {event_data}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/analyze-style")
async def api_analyze_style(
    file: UploadFile,
    vision_llm: str = "{}",
):
    import json as _json

    config = VisionLlmConfig.model_validate_json(vision_llm)
    image_bytes = await file.read()
    style_text = await analyze_image_style(image_bytes, file.content_type or "image/png", config)
    return {"style_analysis": style_text}


# ── 异步任务队列端点 ──────────────────────────────────────────────


@app.post("/api/agent/submit")
async def api_agent_submit(body: AgentGenerateBody):
    """Submit an agent job to the queue. Returns job_id immediately."""
    from agent.models import LlmConfig

    llm = body.llm
    job_id, pending = await submit_job(
        prompt=body.prompt,
        llm_config=llm,
        style_analysis=body.style_analysis,
        rules=body.rules,
        max_retries=body.max_retries,
    )
    return {
        "job_id": job_id,
        "queue_position": pending,
        "status": "pending",
    }


@app.get("/api/agent/status/{job_id}")
async def api_agent_status(job_id: str):
    """Poll job status."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "code": job.code,
        "video_url": job.video_url,
        "error": job.error,
        "events_count": len(job.events),
    }


@app.get("/api/agent/stream/{job_id}")
async def api_agent_stream(job_id: str):
    """SSE stream for a specific job. Replays past events, then streams live."""
    import json as _json

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        replayed = 0
        while True:
            # Replay any new events since last check
            while replayed < len(job.events):
                event = job.events[replayed]
                event_type = event["event"]
                event_data = _json.dumps(event["data"], ensure_ascii=False)
                yield f"event: {event_type}\ndata: {event_data}\n\n"
                replayed += 1

            # If job is done, send done event and close
            if job.status in ("complete", "error"):
                yield "event: done\ndata: {}\n\n"
                return

            # Wait for new events (with timeout to prevent hanging)
            listener = asyncio.Event()
            job._listeners.append(listener)
            try:
                await asyncio.wait_for(listener.wait(), timeout=30)
            except asyncio.TimeoutError:
                # Send keepalive comment
                yield ": keepalive\n\n"
            finally:
                if listener in job._listeners:
                    job._listeners.remove(listener)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/agent/queue")
async def api_agent_queue():
    """Get queue status."""
    return get_queue_info()


# ── 教师模式端点 ──────────────────────────────────────────────


@app.post("/api/teacher/analyze")
async def api_teacher_analyze(
    file: UploadFile,
    vision_llm: str = "{}",
    vision_model: str = Query(default=""),
    vision_base_url: str = Query(default=""),
    vision_api_key: str = Query(default=""),
    vision_api_format: str = Query(default="openai"),
):
    """Phase 1: Extract math problem from image."""
    import json as _json
    import logging as _log

    # Try form field first, then query params
    if vision_llm and vision_llm != "{}":
        config = VisionLlmConfig.model_validate_json(vision_llm)
    elif vision_api_key:
        config = VisionLlmConfig(api_key=vision_api_key, base_url=vision_base_url or None, model=vision_model or None, api_format=vision_api_format or "openai")
    else:
        config = VisionLlmConfig()

    image_bytes = await file.read()

    _log.getLogger("teacher").info(
        "Analyze RAW vision_llm (%d chars): %s",
        len(vision_llm), vision_llm[:500],
    )
    _log.getLogger("teacher").info(
        "Analyze PARSED - model=%s, base_url=%s, api_key_len=%d, api_key_first4=%s, image_size=%d",
        config.model, config.base_url, len(config.api_key or ""),
        (config.api_key or "")[:4], len(image_bytes),
    )

    if not config.api_key:
        return {"error": f"视觉模型 API Key 未配置。收到的原始数据: vision_llm={vision_llm[:200]}, query_params: model={vision_model}, base_url={vision_base_url}, api_key={'***' if vision_api_key else '(empty)'}"}

    from agent.vision import extract_math_problem
    result = await extract_math_problem(image_bytes, file.content_type or "image/png", config)

    if "error" in result:
        _log.getLogger("teacher").warning("Analyze error: %s", result["error"])

    return result


@app.post("/api/teacher/submit")
async def api_teacher_submit(body: TeacherModeSubmit):
    """Submit teacher mode job (solve + generate or refine + generate)."""
    from agent.models import LlmConfig, AnimationRules

    log.info("Teacher submit - llm: %s, vision_llm: %s",
             f"api_key={'yes' if body.llm and body.llm.api_key else 'no'}, model={body.llm.model if body.llm else None}",
             f"api_key={'yes' if body.vision_llm and body.vision_llm.api_key else 'no'}, model={body.vision_llm.model if body.vision_llm else None}")

    job_id, pending = await submit_teacher_job(
        image_base64=body.image_base64,
        content_type=body.content_type,
        prompt=body.prompt,
        llm_config=body.llm,
        vision_llm_config=body.vision_llm,
        rules=body.rules,
        style_analysis=body.style_analysis,
        session_id=body.session_id,
        refinement=body.refinement,
        step_index=body.step_index,
        phase=body.phase,
    )
    return {
        "job_id": job_id,
        "queue_position": pending,
        "status": "pending",
    }


async def submit_teacher_job(
    image_base64: str | None = None,
    content_type: str = "image/png",
    prompt: str = "",
    llm_config=None,
    vision_llm_config=None,
    rules=None,
    style_analysis: str | None = None,
    session_id: str | None = None,
    refinement: str | None = None,
    step_index: int | None = None,
    phase: str = "direct",
) -> tuple[str, int]:
    """Submit a teacher workflow job to the queue."""
    import asyncio as _asyncio
    from agent.queue import _semaphore, _jobs, JobState
    from agent.models import LlmConfig, VisionLlmConfig, AnimationRules
    import uuid as _uuid

    job_id = str(_uuid.uuid4())
    job = JobState(job_id=job_id)
    _jobs[job_id] = job

    pending = sum(1 for j in _jobs.values() if j.status == "pending")

    async def _run():
        async with _semaphore:
            job.status = "running"
            async for event in run_teacher_workflow(
                image_base64=image_base64,
                content_type=content_type,
                prompt=prompt,
                llm_config=llm_config,
                vision_llm_config=vision_llm_config,
                rules=rules,
                style_analysis=style_analysis,
                session_id=session_id,
                refinement=refinement,
                step_index=step_index,
                phase=phase,
            ):
                job.events.append(event)
                if event["event"] == "complete":
                    job.code = event["data"].get("code")
                    job.video_url = event["data"].get("video_url")
                    job.status = "complete"
                elif event["event"] == "error":
                    job.error = event["data"].get("message")
                    job.status = "error"
                # Notify SSE listeners
                for listener in job._listeners:
                    listener.set()
            job.result_event.set()

    _asyncio.create_task(_run())
    return job_id, pending


# ── Serve frontend static files (SPA) ──
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve frontend SPA — all non-API routes return index.html."""
        file_path = _frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_frontend_dist / "index.html"))

