"""In-memory async task queue with concurrency control."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field

from .models import AnimationRules, LlmConfig
from .workflow import run_agent_workflow

log = logging.getLogger(__name__)

MAX_CONCURRENT = 3

_semaphore = asyncio.Semaphore(MAX_CONCURRENT)


@dataclass
class JobState:
    job_id: str
    status: str = "pending"  # pending | running | complete | error
    events: list[dict] = field(default_factory=list)
    code: str | None = None
    video_url: str | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    _event: asyncio.Event = field(default_factory=asyncio.Event)
    _listeners: list[asyncio.Event] = field(default_factory=list)

    def notify_listeners(self) -> None:
        for listener in self._listeners:
            listener.set()
        self._listeners.clear()


_jobs: dict[str, JobState] = {}


async def submit_job(
    *,
    prompt: str,
    llm_config: LlmConfig | None = None,
    style_analysis: str | None = None,
    rules: AnimationRules | None = None,
    max_retries: int = 3,
    on_complete=None,
) -> tuple[str, int]:
    """Submit a job. Returns (job_id, queue_position)."""
    job_id = str(uuid.uuid4())
    job = JobState(job_id=job_id)
    _jobs[job_id] = job

    pending = sum(1 for j in _jobs.values() if j.status in ("pending", "running"))

    asyncio.create_task(
        _run_job(
            job,
            prompt=prompt,
            llm_config=llm_config,
            style_analysis=style_analysis,
            rules=rules,
            max_syntax_retries=max_retries,
            max_render_retries=max(1, max_retries - 1),
            on_complete=on_complete,
        )
    )

    return job_id, pending


async def _run_job(
    job: JobState,
    on_complete=None,
    **kwargs,
) -> None:
    """Execute agent workflow in background with semaphore control."""
    try:
        async with _semaphore:
            job.status = "running"
            job.notify_listeners()

            async for event in run_agent_workflow(**kwargs):
                job.events.append(event)
                job.notify_listeners()

                evt = event["event"]
                if evt == "complete":
                    job.code = event["data"].get("code")
                    job.video_url = event["data"].get("video_url")
                    job.status = "complete"
                elif evt == "error":
                    job.error = event["data"].get("message")
                    job.status = "error"

    except Exception as e:
        log.exception("Job %s failed unexpectedly", job.job_id)
        job.status = "error"
        job.error = str(e)
        job.events.append({"event": "error", "data": {"message": str(e), "recoverable": False}})
    finally:
        job._event.set()
        job.notify_listeners()
        # Call on_complete callback if provided
        if on_complete and job.status == "complete" and job.code:
            try:
                on_complete(job.job_id, job.code)
            except Exception as e:
                log.warning("on_complete callback failed: %s", e)


def get_job(job_id: str) -> JobState | None:
    return _jobs.get(job_id)


def get_queue_info() -> dict:
    """Return queue status summary."""
    pending = sum(1 for j in _jobs.values() if j.status == "pending")
    running = sum(1 for j in _jobs.values() if j.status == "running")
    return {
        "pending": pending,
        "running": running,
        "max_concurrent": MAX_CONCURRENT,
    }
