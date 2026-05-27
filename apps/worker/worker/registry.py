from __future__ import annotations

from collections.abc import Callable

from .models import HandlerResult, Job


JobHandler = Callable[[Job], HandlerResult]


class JobHandlerRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, JobHandler] = {}

    def register(self, job_type: str, handler: JobHandler) -> None:
        if job_type in self._handlers:
            raise ValueError(f"handler already registered for {job_type}")
        self._handlers[job_type] = handler

    def handle(self, job: Job) -> HandlerResult:
        handler = self._handlers.get(job.type)
        if handler is None:
            raise ValueError(f"unsupported job type: {job.type}")
        return handler(job)

    @property
    def supported_types(self) -> tuple[str, ...]:
        return tuple(self._handlers.keys())
