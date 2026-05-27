from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .models import HandlerResult, JobStatus


TERMINAL_JOB_STATUSES = {
    "succeeded",
    "partially_succeeded",
    "failed",
    "timed_out",
    "cancelled",
}


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def is_terminal(status: str) -> bool:
    return status in TERMINAL_JOB_STATUSES


def running_update() -> dict[str, Any]:
    return {
        "status": "running",
        "started_at": utc_now_iso(),
        "error_code": None,
        "error_message": None,
    }


def terminal_update(result: HandlerResult) -> dict[str, Any]:
    update: dict[str, Any] = {
        "status": result.status,
        "result_json": result.result_json,
        "error_code": result.error_code,
        "error_message": result.error_message,
        "finished_at": utc_now_iso(),
    }
    return update


def failed_result(
    *,
    code: str,
    message: str,
    result_json: dict[str, Any] | None = None,
    status: JobStatus = "failed",
) -> HandlerResult:
    return HandlerResult(
        status=status,
        result_json=result_json or {},
        error_code=code,
        error_message=message[:1000],
    )


def exception_result(exc: Exception) -> HandlerResult:
    return failed_result(
        code=exc.__class__.__name__,
        message=str(exc) or "worker handler failed",
    )
