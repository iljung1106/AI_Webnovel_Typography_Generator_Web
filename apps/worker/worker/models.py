from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


JobType = Literal["layout_generation", "style_resolution", "typography_generation"]
JobStatus = Literal[
    "queued",
    "running",
    "succeeded",
    "partially_succeeded",
    "failed",
    "timed_out",
    "cancelled",
]


@dataclass(frozen=True)
class Job:
    id: str
    user_id: str
    project_id: str | None
    version_id: str | None
    type: str
    status: str
    input_json: dict[str, Any] = field(default_factory=dict)
    result_json: dict[str, Any] = field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None
    timeout_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "Job":
        return cls(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            project_id=str(row["project_id"]) if row.get("project_id") else None,
            version_id=str(row["version_id"]) if row.get("version_id") else None,
            type=str(row["type"]),
            status=str(row["status"]),
            input_json=dict(row.get("input_json") or {}),
            result_json=dict(row.get("result_json") or {}),
            error_code=row.get("error_code"),
            error_message=row.get("error_message"),
            timeout_at=row.get("timeout_at"),
        )


@dataclass(frozen=True)
class HandlerResult:
    status: JobStatus
    result_json: dict[str, Any]
    error_code: str | None = None
    error_message: str | None = None
