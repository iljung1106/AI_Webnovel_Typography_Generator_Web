from __future__ import annotations

from typing import Any
from urllib.parse import quote

import requests

from .settings import settings


class SupabaseConfigError(RuntimeError):
    pass


class SupabaseRequestError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class SupabaseClient:
    def __init__(self) -> None:
        self.base_url = settings.supabase_url.rstrip("/")
        self.service_role_key = settings.supabase_service_role_key
        self.auth_api_key = settings.supabase_anon_key or settings.supabase_service_role_key

    def require_configured(self) -> None:
        if not self.base_url or not self.service_role_key:
            raise SupabaseConfigError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for database-backed API routes."
            )

    def require_auth_configured(self) -> None:
        if not self.base_url or not self.auth_api_key:
            raise SupabaseConfigError(
                "SUPABASE_URL and SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY are required for auth."
            )

    def _rest_headers(self, prefer: str | None = None) -> dict[str, str]:
        self.require_configured()
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _auth_headers(self, access_token: str) -> dict[str, str]:
        self.require_auth_configured()
        return {
            "apikey": self.auth_api_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def _request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        params: dict[str, str] | None = None,
        json: dict[str, Any] | list[dict[str, Any]] | None = None,
    ) -> Any:
        response = requests.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json,
            timeout=20,
        )
        if response.status_code >= 400:
            raise SupabaseRequestError(response.status_code, self._error_message(response))
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    @staticmethod
    def _error_message(response: requests.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return response.text or "Supabase request failed."
        if isinstance(payload, dict):
            return (
                payload.get("message")
                or payload.get("msg")
                or payload.get("error_description")
                or payload.get("error")
                or "Supabase request failed."
            )
        return "Supabase request failed."

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        url = f"{self.base_url}/rest/v1/{table}"
        payload = self._request("GET", url, headers=self._rest_headers(), params=params)
        return payload or []

    def insert(self, table: str, payload: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        url = f"{self.base_url}/rest/v1/{table}"
        result = self._request(
            "POST",
            url,
            headers=self._rest_headers("return=representation"),
            json=payload,
        )
        return result or []

    def update(
        self,
        table: str,
        params: dict[str, str],
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        url = f"{self.base_url}/rest/v1/{table}"
        result = self._request(
            "PATCH",
            url,
            headers=self._rest_headers("return=representation"),
            params=params,
            json=payload,
        )
        return result or []

    def rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        url = f"{self.base_url}/rest/v1/rpc/{function_name}"
        return self._request(
            "POST",
            url,
            headers=self._rest_headers(),
            json=payload,
        )

    def get_auth_user(self, access_token: str) -> dict[str, Any]:
        url = f"{self.base_url}/auth/v1/user"
        payload = self._request("GET", url, headers=self._auth_headers(access_token))
        if not isinstance(payload, dict) or not payload.get("id"):
            raise SupabaseRequestError(401, "Invalid Supabase access token.")
        return payload

    def signed_download_url(self, bucket: str, storage_path: str, expires_in: int) -> str:
        url = self._storage_object_url("sign", bucket, storage_path)
        payload = self._request(
            "POST",
            url,
            headers=self._rest_headers(),
            json={"expiresIn": expires_in},
        )
        return self._normalize_storage_url(payload)

    def signed_upload_url(self, bucket: str, storage_path: str) -> str:
        url = self._storage_object_url("upload/sign", bucket, storage_path)
        payload = self._request(
            "POST",
            url,
            headers=self._rest_headers(),
            json={},
        )
        return self._normalize_storage_url(payload)

    def _storage_object_url(self, action: str, bucket: str, storage_path: str) -> str:
        safe_bucket = quote(bucket, safe="")
        safe_path = quote(storage_path.lstrip("/"), safe="/")
        return f"{self.base_url}/storage/v1/object/{action}/{safe_bucket}/{safe_path}"

    def _normalize_storage_url(self, payload: Any) -> str:
        if not isinstance(payload, dict):
            raise SupabaseRequestError(502, "Supabase Storage returned an unexpected response.")
        signed_url = payload.get("signedURL") or payload.get("signedUrl") or payload.get("url")
        if not signed_url:
            raise SupabaseRequestError(502, "Supabase Storage did not return a signed URL.")
        if signed_url.startswith("http://") or signed_url.startswith("https://"):
            return signed_url
        if signed_url.startswith("/object/"):
            return f"{self.base_url}/storage/v1{signed_url}"
        return f"{self.base_url}{signed_url}"


supabase = SupabaseClient()
