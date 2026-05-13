"""Supabase：校验用户 JWT、写入项目、上传渲染视频。"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from uuid import UUID

import jwt
from supabase import Client, create_client

_BUCKET = "renders"


def parse_bearer_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def get_supabase_admin() -> Client | None:
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        return None
    return create_client(url, key)


def decode_user_id_from_jwt(token: str) -> UUID | None:
    secret = (os.environ.get("SUPABASE_JWT_SECRET") or "").strip()
    if not secret or not token:
        return None
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        sub = payload.get("sub")
        if not sub or not isinstance(sub, str):
            return None
        return UUID(sub)
    except (jwt.PyJWTError, ValueError):
        return None


def public_object_url(storage_path: str) -> str:
    base = os.environ["SUPABASE_URL"].rstrip("/")
    return f"{base}/storage/v1/object/public/{_BUCKET}/{storage_path}"


def insert_project(
    sb: Client,
    *,
    user_id: UUID,
    job_id: str,
    prompt: str,
    code: str,
) -> None:
    sb.table("manim_projects").insert(
        {
            "user_id": str(user_id),
            "job_id": job_id,
            "prompt": prompt,
            "code": code,
            "status": "code_ready",
        }
    ).execute()


def update_project_code(sb: Client, job_id: str, code: str) -> None:
    sb.table("manim_projects").update({"code": code, "status": "code_ready"}).eq("job_id", job_id).execute()


def update_project_rendered(sb: Client, job_id: str, storage_object_path: str) -> None:
    sb.table("manim_projects").update(
        {
            "status": "rendered",
            "storage_object_path": storage_object_path,
        }
    ).eq("job_id", job_id).execute()


def upload_render_mp4(sb: Client, local_mp4: Path, storage_path: str) -> None:
    data = local_mp4.read_bytes()
    sb.storage.from_(_BUCKET).upload(
        storage_path,
        data,
        file_options={
            "content-type": "video/mp4",
            "upsert": "true",
        },
    )


def get_project_for_user(sb: Client, user_id: UUID, job_id: str) -> dict[str, Any] | None:
    res = (
        sb.table("manim_projects")
        .select("job_id,prompt,code,status,storage_object_path,created_at")
        .eq("job_id", job_id)
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    row = dict(rows[0])
    path = row.get("storage_object_path")
    if path:
        row["video_url"] = public_object_url(path)
    return row


def list_user_projects(sb: Client, user_id: UUID, limit: int = 50) -> list[dict[str, Any]]:
    q = (
        sb.table("manim_projects")
        .select("id,job_id,prompt,status,storage_object_path,created_at")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .limit(limit)
    )
    res = q.execute()
    rows = res.data or []
    out: list[dict[str, Any]] = []
    for row in rows:
        path = row.get("storage_object_path")
        if path:
            row = {**row, "video_url": public_object_url(path)}
        out.append(row)
    return out
