from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _csv_env(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_env: str = os.environ.get("APP_ENV", "development")
    supabase_url: str = os.environ.get("SUPABASE_URL", "")
    supabase_anon_key: str = os.environ.get("SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_storage_bucket: str = os.environ.get("SUPABASE_STORAGE_BUCKET", "project-assets")
    signed_url_expires_in: int = int(os.environ.get("SIGNED_URL_EXPIRES_IN", "300"))
    allow_dev_auth: bool = _bool_env(
        "ALLOW_DEV_AUTH",
        os.environ.get("APP_ENV", "development") != "production",
    )
    allowed_origins: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.allowed_origins is None:
            object.__setattr__(
                self,
                "allowed_origins",
                _csv_env(
                    "ALLOWED_ORIGINS",
                    "http://127.0.0.1:3000,http://localhost:3000",
                ),
            )


settings = Settings()
