"""Supabase：校验用户 JWT、写入项目、上传渲染视频。"""

from __future__ import annotations

import os
import uuid as _uuid
from pathlib import Path
from typing import Any
from uuid import UUID

import json
import logging
import time
import urllib.request
from functools import lru_cache

import jwt
from supabase import Client, create_client

try:
    from jose import jwt as jose_jwt, JWTError as JoseJWTError
    _HAS_JOSE = True
except ImportError:
    _HAS_JOSE = False

_log = logging.getLogger("supabase_sync")

# Cache for JWKs fetched from Supabase (keyed by supabase URL)
_jwks_cache: dict[str, tuple[float, list[dict]]] = {}
_JWKS_TTL = 3600  # 1 hour


def _fetch_jwks(supabase_url: str) -> list[dict]:
    now = time.time()
    cached = _jwks_cache.get(supabase_url)
    if cached and now - cached[0] < _JWKS_TTL:
        return cached[1]
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        req = urllib.request.Request(jwks_url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        keys = data.get("keys", [])
        _jwks_cache[supabase_url] = (now, keys)
        _log.info("Fetched %d JWKs from %s", len(keys), jwks_url)
        return keys
    except Exception as e:
        _log.warning("Failed to fetch JWKs from %s: %s", jwks_url, e)
        return cached[1] if cached else []


def _verify_es256(token: str, jwks: list[dict]) -> dict | None:
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    # Build a python-jose compatible JWKS
    if _HAS_JOSE:
        try:
            # python-jose can verify directly with a JWKSet
            jwk_set = {"keys": jwks}
            payload = jose_jwt.decode(token, jwk_set, algorithms=["ES256"], options={"verify_aud": False})
            _log.info("ES256 verified via python-jose, sub=%s", payload.get("sub"))
            return payload
        except JoseJWTError as e:
            _log.error("python-jose ES256 verification failed: %s", e)
            return None
        except Exception as e:
            _log.error("python-jose ES256 unexpected error: %s — %s", type(e).__name__, e)
            return None

    # Fallback: try PyJWT
    try:
        from jwt.algorithms import ECAlgorithm
        for jwk in jwks:
            if jwk.get("kid") == kid:
                pub_key = ECAlgorithm.from_jwk(json.dumps(jwk))
                return jwt.decode(token, pub_key, algorithms=["ES256"], options={"verify_aud": False})
    except Exception as e:
        _log.error("PyJWT ES256 failed: %s", e)

    _log.error("No ES256 verification method available")
    return None

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
    if not token:
        _log.warning("No JWT token provided")
        return None

    # Detect algorithm from header
    try:
        header = jwt.get_unverified_header(token)
    except Exception as e:
        _log.error("Cannot parse JWT header: %s", e)
        return None

    alg = header.get("alg", "")
    payload = None

    if alg == "ES256":
        # ES256 — fetch public key from Supabase JWKs
        supabase_url = (os.environ.get("SUPABASE_URL") or "").strip()
        if not supabase_url:
            _log.warning("SUPABASE_URL not set — cannot fetch JWKs for ES256")
            return None
        jwks = _fetch_jwks(supabase_url)
        if not jwks:
            _log.error("No JWKs available for ES256 verification")
            return None
        payload = _verify_es256(token, jwks)
    elif alg == "HS256":
        # Legacy HS256 — use JWT secret
        secret = (os.environ.get("SUPABASE_JWT_SECRET") or "").strip()
        if not secret:
            _log.warning("SUPABASE_JWT_SECRET is empty — cannot decode HS256 JWT")
            return None
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        except jwt.ExpiredSignatureError:
            _log.warning("JWT token has expired")
            return None
        except jwt.InvalidSignatureError:
            _log.error("HS256 signature mismatch — SUPABASE_JWT_SECRET doesn't match")
            return None
        except Exception as e:
            _log.error("HS256 decode failed: %s", e)
            return None
    else:
        _log.error("Unsupported JWT algorithm: %s", alg)
        return None

    if payload is None:
        _log.error("JWT verification failed (alg=%s)", alg)
        return None

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        _log.warning("JWT payload missing 'sub': %s", list(payload.keys()))
        return None
    try:
        return UUID(sub)
    except ValueError:
        _log.error("Invalid UUID in JWT sub: %s", sub)
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


def get_user_settings(sb: Client, user_id: UUID) -> dict[str, Any] | None:
    res = (
        sb.table("user_settings")
        .select("settings_json")
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    return rows[0].get("settings_json")


def upsert_user_settings(sb: Client, user_id: UUID, settings_json: dict[str, Any]) -> None:
    sb.table("user_settings").upsert(
        {
            "user_id": str(user_id),
            "settings_json": settings_json,
        },
        on_conflict="user_id",
    ).execute()


def create_draft_project(sb: Client, *, user_id: UUID, name: str) -> dict[str, Any]:
    job_id = str(_uuid.uuid4())
    sb.table("manim_projects").insert(
        {
            "user_id": str(user_id),
            "job_id": job_id,
            "prompt": name,
            "code": "",
            "status": "draft",
        }
    ).execute()
    return {"job_id": job_id, "prompt": name, "status": "draft"}
