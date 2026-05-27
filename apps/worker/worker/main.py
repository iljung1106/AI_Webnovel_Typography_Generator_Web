from __future__ import annotations

import logging
import time

from .services import WorkerContext, build_registry
from .settings import settings
from .status import exception_result, terminal_update
from .supabase_client import SupabaseRestClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("typography-worker")


def poll_once() -> bool:
    """Claim and process one queued job."""
    db = SupabaseRestClient.from_settings(settings)
    context = WorkerContext(db=db, settings=settings)
    registry = build_registry(context)
    job = db.claim_next_job(
        supported_types=registry.supported_types,
        use_rpc=settings.use_claim_job_rpc,
        rpc_name=settings.claim_job_rpc_name,
        worker_id=settings.worker_id,
    )
    if job is None:
        logger.debug("no queued jobs")
        return False

    logger.info("claimed job id=%s type=%s", job.id, job.type)
    try:
        result = registry.handle(job)
    except Exception as exc:
        logger.exception("job failed id=%s type=%s", job.id, job.type)
        result = exception_result(exc)
    db.update_job(job.id, terminal_update(result))
    logger.info("finished job id=%s status=%s", job.id, result.status)
    return True


def run_forever() -> None:
    logger.info("worker starting env=%s", settings.app_env)
    while True:
        poll_once()
        time.sleep(settings.job_poll_interval_seconds)


if __name__ == "__main__":
    run_forever()
