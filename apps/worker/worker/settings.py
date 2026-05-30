from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_env: str = os.environ.get("APP_ENV", "development")
    supabase_url: str = os.environ.get("SUPABASE_URL", "")
    supabase_service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_request_timeout_seconds: float = float(
        os.environ.get("SUPABASE_REQUEST_TIMEOUT_SECONDS", "30")
    )
    job_poll_interval_seconds: float = float(os.environ.get("JOB_POLL_INTERVAL_SECONDS", "2"))
    job_poll_idle_min_seconds: float = float(
        os.environ.get("JOB_POLL_IDLE_MIN_SECONDS", os.environ.get("JOB_POLL_INTERVAL_SECONDS", "2"))
    )
    job_poll_idle_max_seconds: float = float(os.environ.get("JOB_POLL_IDLE_MAX_SECONDS", "15"))
    generation_batch_timeout_seconds: float = float(
        os.environ.get("GENERATION_BATCH_TIMEOUT_SECONDS", "300")
    )
    worker_id: str = os.environ.get("WORKER_ID", "typography-worker")
    use_claim_job_rpc: bool = os.environ.get("USE_CLAIM_JOB_RPC", "1").lower() in {
        "1",
        "true",
        "yes",
    }
    claim_job_rpc_name: str = os.environ.get("CLAIM_JOB_RPC_NAME", "claim_next_job")
    worker_output_dir: Path = Path(os.environ.get("WORKER_OUTPUT_DIR", "worker_output"))
    typography_results_bucket: str = os.environ.get(
        "TYPOGRAPHY_RESULTS_BUCKET",
        "typography-results",
    )
    upload_generated_assets: bool = os.environ.get("UPLOAD_GENERATED_ASSETS", "1").lower() in {
        "1",
        "true",
        "yes",
    }


settings = Settings()
