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


async def render_animation(code: str, job_id: str) -> dict:
    job_dir = WORKDIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    script_path = job_dir / "scene.py"
    script_path.write_text(code, encoding="utf-8")

    try:
        proc = await asyncio.create_subprocess_exec(
            "manim", "render", "-ql", str(script_path), SCENE_CLASS,
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
        return {"passed": False, "error": "Render timed out (120s)", "video_url": None}


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
