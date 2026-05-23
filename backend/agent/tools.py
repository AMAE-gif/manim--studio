"""Tool definitions and executors for the Agent."""

from __future__ import annotations

import ast
import asyncio
import json
import logging
from pathlib import Path

log = logging.getLogger(__name__)

SCENE_CLASS = "GeneratedScene"
WORKDIR = Path(__file__).resolve().parent.parent / "renders"

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "validate_syntax",
            "description": "Validate Python syntax of generated Manim code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "The Python code to validate"}
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_manim_imports",
            "description": "Check that the code has valid Manim imports and structure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "The Python code to check"}
                },
                "required": ["code"],
            },
        },
    },
]


def validate_syntax(code: str) -> dict:
    try:
        ast.parse(code)
        return {"passed": True, "error": None}
    except SyntaxError as e:
        return {"passed": False, "error": f"Line {e.lineno}: {e.msg}"}


def check_manim_imports(code: str) -> dict:
    checks = {
        "has_from_manim_import": "from manim import" in code,
        "has_scene_class": f"class {SCENE_CLASS}(Scene)" in code,
        "has_construct": "def construct(self)" in code,
    }
    return {"valid": all(checks.values()), "checks": checks}


def check_chinese_in_mathtex(code: str) -> dict:
    """Check if Chinese characters are used inside MathTex/Tex (which causes LaTeX errors)."""
    import re
    # Find all MathTex/Tex calls with Chinese characters
    pattern = r'(?:MathTex|Tex)\s*\(\s*r?["\']([^"\']*)["\']'
    matches = re.findall(pattern, code)

    chinese_pattern = re.compile(r'[一-鿿]')
    issues = []

    for match in matches:
        if chinese_pattern.search(match):
            issues.append(f"Chinese in MathTex: {match[:40]}")
        # Check for $ delimiters (markdown-style, invalid in MathTex)
        if match.startswith('$') or match.endswith('$'):
            issues.append(f"$ delimiter in MathTex: {match[:40]}")

    # Also detect nested MathTex/Tex (invalid Manim calls)
    nested = bool(re.search(r'MathTex\(\s*(?:MathTex|Tex)\s*\(', code))
    if nested:
        issues.append("nested MathTex/Tex detected")

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "message": f"Found {len(issues)} MathTex/Tex issues" if issues else None
    }


def fix_chinese_in_mathtex(code: str) -> str:
    """Auto-fix Chinese characters and $ delimiters in MathTex, collapse nested calls."""
    import re

    chinese_pattern = re.compile(r'[一-鿿]')

    def fix_tex_content(match):
        tex_content = match.group(1)
        needs_fix = False

        # Strip $ delimiters (markdown-style, invalid in MathTex)
        if tex_content.startswith('$'):
            tex_content = tex_content[1:]
            needs_fix = True
        if tex_content.endswith('$'):
            tex_content = tex_content[:-1]
            needs_fix = True

        # Remove Chinese characters
        if chinese_pattern.search(tex_content):
            tex_content = re.sub(r'[一-鿿]+', '', tex_content)
            tex_content = re.sub(r'\\text\{\s*\}', '', tex_content)
            needs_fix = True

        if not needs_fix:
            return match.group(0)

        tex_content = re.sub(r'\s+', ' ', tex_content).strip()
        if not tex_content:
            tex_content = r'\ '
        prefix = match.group(0).split('(')[0]  # "MathTex" or "Tex"
        return f'{prefix}(r"{tex_content}"'

    # Step 1: Fix MathTex and Tex content
    code = re.sub(r'MathTex\(\s*r?["\']([^"\']*)["\']', fix_tex_content, code)
    code = re.sub(r'Tex\(\s*r?["\']([^"\']*)["\']', fix_tex_content, code)

    # Step 2: Collapse nested MathTex/Tex — these are invalid Manim calls
    # MathTex(MathTex(...)) -> MathTex(...)
    code = re.sub(r'MathTex\(\s*MathTex\(', 'MathTex(', code)
    # MathTex(Tex(...)) -> MathTex(...)
    code = re.sub(r'MathTex\(\s*Tex\(', 'MathTex(', code)
    # Tex(MathTex(...)) -> MathTex(...)
    code = re.sub(r'Tex\(\s*MathTex\(', 'MathTex(', code)

    return code


def extract_code_from_response(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t[3:]
        if t.endswith("```"):
            t = t[:-3]
    return t.strip()


def find_manim_video(job_dir: Path) -> str | None:
    media_dir = job_dir / "media" / "videos"
    if not media_dir.exists():
        return None
    videos = sorted(media_dir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    return str(videos[0]) if videos else None


async def render_animation(code: str, job_id: str, quality: str = "ql") -> dict:
    job_dir = WORKDIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    script_path = job_dir / "scene.py"
    script_path.write_text(code, encoding="utf-8")

    # quality: "ql" (480p), "qm" (720p), "qh" (1080p), "qk" (4K)
    quality_flag = f"-{quality}" if quality in ("ql", "qm", "qh", "qk") else "-ql"

    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "manim", "render", quality_flag, str(script_path), SCENE_CLASS,
            cwd=str(job_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

        if proc.returncode != 0:
            error = (stderr.decode(errors="replace") or stdout.decode(errors="replace"))[-4000:]
            return {"passed": False, "error": error, "video_url": None}

        video = find_manim_video(job_dir)
        if video:
            return {"passed": True, "error": None, "video_url": f"/api/video/{job_id}"}
        return {"passed": False, "error": "No output video found", "video_url": None}

    except asyncio.TimeoutError:
        # Kill the subprocess on timeout
        if proc:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
        return {"passed": False, "error": "Render timed out (120s) — manim 进程已终止", "video_url": None}
    except FileNotFoundError:
        return {"passed": False, "error": "manim 命令未找到，请确认已安装 manim", "video_url": None}
    except Exception as e:
        log.error("render_animation unexpected error: %s", e)
        if proc:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
        return {"passed": False, "error": f"渲染异常: {e}", "video_url": None}


async def execute_tool(tool_call) -> dict:
    name = tool_call.function.name
    try:
        args = json.loads(tool_call.function.arguments)
    except json.JSONDecodeError:
        return {"error": f"Invalid arguments for tool {name}"}

    if name == "validate_syntax":
        return validate_syntax(args.get("code", ""))
    elif name == "check_manim_imports":
        return check_manim_imports(args.get("code", ""))
    else:
        return {"error": f"Unknown tool: {name}"}
