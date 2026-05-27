from __future__ import annotations

import logging
import mimetypes
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

import requests

from .models import Job
from .settings import Settings
from .status import running_update, utc_now_iso

logger = logging.getLogger(__name__)


class SupabaseRestError(RuntimeError):
    pass


class SupabaseRestClient:
    def __init__(self, *, url: str, service_role_key: str, timeout_seconds: float = 30) -> None:
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_settings(cls, settings: Settings) -> "SupabaseRestClient":
        return cls(
            url=settings.supabase_url,
            service_role_key=settings.supabase_service_role_key,
            timeout_seconds=settings.supabase_request_timeout_seconds,
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.url and self.service_role_key)

    def claim_next_job(
        self,
        *,
        supported_types: Iterable[str],
        use_rpc: bool = False,
        rpc_name: str = "claim_next_job",
        worker_id: str = "worker",
    ) -> Job | None:
        if not self.is_configured:
            logger.warning("Supabase is not configured; skipping worker poll.")
            return None

        types = list(supported_types)
        if use_rpc:
            claimed = self._claim_next_job_rpc(
                supported_types=types,
                rpc_name=rpc_name,
                worker_id=worker_id,
            )
            if claimed is not None:
                return claimed

        queued = self._select_next_queued_job(types)
        if queued is None:
            return None

        claimed_rows = self.patch_rows(
            "jobs",
            filters={"id": f"eq.{queued.id}", "status": "eq.queued"},
            payload=running_update(),
        )
        if not claimed_rows:
            return None
        return Job.from_row(claimed_rows[0])

    def update_job(self, job_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        rows = self.patch_rows("jobs", filters={"id": f"eq.{job_id}"}, payload=payload)
        return rows[0] if rows else None

    def patch_project_version(self, version_id: str, payload: dict[str, Any]) -> None:
        self.patch_rows("project_versions", filters={"id": f"eq.{version_id}"}, payload=payload)

    def get_generation_batch_for_job(self, job_id: str) -> dict[str, Any] | None:
        rows = self.get_rows(
            "generation_batches",
            params={"job_id": f"eq.{job_id}", "select": "*", "limit": "1"},
        )
        return rows[0] if rows else None

    def ensure_generation_batch(
        self,
        *,
        job: Job,
        credit_cost_total: float = 0,
    ) -> dict[str, Any]:
        existing = self.get_generation_batch_for_job(job.id)
        if existing is not None:
            return existing
        if not job.project_id or not job.version_id:
            raise ValueError("typography_generation jobs require project_id and version_id.")
        rows = self.insert_rows(
            "generation_batches",
            [
                {
                    "user_id": job.user_id,
                    "project_id": job.project_id,
                    "version_id": job.version_id,
                    "job_id": job.id,
                    "credit_cost_total": credit_cost_total,
                    "status": "running",
                }
            ],
        )
        return rows[0]

    def list_generation_slots(self, batch_id: str) -> list[dict[str, Any]]:
        return self.get_rows(
            "generation_slots",
            params={
                "batch_id": f"eq.{batch_id}",
                "select": "*",
                "order": "slot_index.asc",
            },
        )

    def ensure_generation_slots(
        self,
        *,
        batch_id: str,
        seeds: list[int],
        credit_cost: float = 0,
    ) -> list[dict[str, Any]]:
        existing = self.list_generation_slots(batch_id)
        existing_indexes = {int(slot.get("slot_index", 0)) for slot in existing}
        missing_rows = [
            {
                "batch_id": batch_id,
                "slot_index": index,
                "seed": seed,
                "status": "queued",
                "credit_cost": credit_cost,
            }
            for index, seed in enumerate(seeds, start=1)
            if index not in existing_indexes
        ]
        if existing and not missing_rows:
            return existing
        if existing and missing_rows:
            self.insert_rows("generation_slots", missing_rows)
            return self.list_generation_slots(batch_id)
        rows = [
            {
                "batch_id": batch_id,
                "slot_index": index,
                "seed": seed,
                "status": "queued",
                "credit_cost": credit_cost,
            }
            for index, seed in enumerate(seeds, start=1)
        ]
        return self.insert_rows("generation_slots", rows)

    def update_generation_batch(self, batch_id: str, payload: dict[str, Any]) -> None:
        self.patch_rows("generation_batches", filters={"id": f"eq.{batch_id}"}, payload=payload)

    def update_generation_slot(self, slot_id: str, payload: dict[str, Any]) -> None:
        self.patch_rows("generation_slots", filters={"id": f"eq.{slot_id}"}, payload=payload)

    def create_asset_for_file(
        self,
        *,
        file_path: Path,
        user_id: str,
        project_id: str | None,
        version_id: str | None,
        asset_type: str,
        bucket: str,
        storage_path: str,
        upload: bool,
    ) -> dict[str, Any]:
        mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        if upload:
            self.upload_storage_file(
                bucket=bucket,
                storage_path=storage_path,
                file_path=file_path,
                content_type=mime_type,
            )
        width, height = self._image_dimensions(file_path)
        rows = self.insert_rows(
            "assets",
            [
                {
                    "user_id": user_id,
                    "project_id": project_id,
                    "version_id": version_id,
                    "type": asset_type,
                    "storage_bucket": bucket,
                    "storage_path": storage_path,
                    "mime_type": mime_type,
                    "width": width,
                    "height": height,
                    "size_bytes": file_path.stat().st_size,
                }
            ],
        )
        return rows[0]

    def get_rows(self, table: str, *, params: dict[str, str]) -> list[dict[str, Any]]:
        response = self._request("GET", f"/rest/v1/{table}", params=params)
        return self._json_rows(response)

    def insert_rows(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        response = self._request(
            "POST",
            f"/rest/v1/{table}",
            json=rows,
            headers={"Prefer": "return=representation"},
        )
        return self._json_rows(response)

    def patch_rows(
        self,
        table: str,
        *,
        filters: dict[str, str],
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        response = self._request(
            "PATCH",
            f"/rest/v1/{table}",
            params=filters,
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        return self._json_rows(response)

    def upload_storage_file(
        self,
        *,
        bucket: str,
        storage_path: str,
        file_path: Path,
        content_type: str,
    ) -> None:
        encoded_path = "/".join(quote(part, safe="") for part in storage_path.split("/"))
        data = file_path.read_bytes()
        self._request(
            "POST",
            f"/storage/v1/object/{quote(bucket, safe='')}/{encoded_path}",
            data=data,
            headers={
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )

    def _claim_next_job_rpc(
        self,
        *,
        supported_types: list[str],
        rpc_name: str,
        worker_id: str,
    ) -> Job | None:
        response = self._request(
            "POST",
            f"/rest/v1/rpc/{rpc_name}",
            json={"worker_id": worker_id, "supported_types": supported_types},
            raise_for_status=False,
        )
        if response.status_code in {404, 405}:
            logger.warning("Supabase RPC %s is unavailable; falling back to guarded PATCH.", rpc_name)
            return None
        self._raise_for_status(response)
        rows = self._json_rows(response)
        return Job.from_row(rows[0]) if rows else None

    def _select_next_queued_job(self, supported_types: list[str]) -> Job | None:
        if not supported_types:
            return None
        type_filter = "in.(" + ",".join(supported_types) + ")"
        rows = self.get_rows(
            "jobs",
            params={
                "select": "*",
                "status": "eq.queued",
                "type": type_filter,
                "order": "created_at.asc",
                "limit": "1",
            },
        )
        return Job.from_row(rows[0]) if rows else None

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: Any | None = None,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        raise_for_status: bool = True,
    ) -> requests.Response:
        request_headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if json is not None:
            request_headers["Content-Type"] = "application/json"
        if headers:
            request_headers.update(headers)

        response = requests.request(
            method,
            f"{self.url}{path}",
            params=params,
            json=json,
            data=data,
            headers=request_headers,
            timeout=self.timeout_seconds,
        )
        if raise_for_status:
            self._raise_for_status(response)
        return response

    def _raise_for_status(self, response: requests.Response) -> None:
        if 200 <= response.status_code < 300:
            return
        raise SupabaseRestError(
            f"Supabase REST error {response.status_code}: {response.text[:500]}"
        )

    def _json_rows(self, response: requests.Response) -> list[dict[str, Any]]:
        if not response.content:
            return []
        payload = response.json()
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            return [payload]
        raise SupabaseRestError(f"Unexpected Supabase response payload: {payload!r}")

    def _image_dimensions(self, file_path: Path) -> tuple[int | None, int | None]:
        try:
            from PIL import Image

            with Image.open(file_path) as image:
                return image.size
        except Exception:
            return None, None
