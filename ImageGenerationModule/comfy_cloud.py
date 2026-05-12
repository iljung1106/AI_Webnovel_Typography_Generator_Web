"""
comfy_cloud.py
==============
Comfy Cloud workflow execution client for Python.

Supported flow:
    1. Upload a local input image with POST /api/upload/image
    2. Patch an API-format workflow JSON
    3. Submit the workflow with POST /api/prompt
    4. Poll job status via GET /api/job/{prompt_id}/status
    5. Read outputs from GET /api/history_v2/{prompt_id}
    6. Download generated files via GET /api/view

The implementation follows the Comfy Cloud docs:
    - Overview: https://docs.comfy.org/development/cloud/overview
    - API reference: https://docs.comfy.org/development/cloud/api-reference

Environment:
    COMFY_CLOUD_API_KEY

Dependencies:
    requests
    python-dotenv (optional)

This module is intentionally kept outside LayoutModule because it handles
remote image generation, not typography layout calculation.
"""

from __future__ import annotations

import copy
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Tuple
from urllib.parse import urlencode

import requests

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()


_DEFAULT_BASE_URL = "https://cloud.comfy.org"
_DEFAULT_TIMEOUT = 60
_DEFAULT_POLL_INTERVAL = 2.0
_FINAL_STATUSES = {"completed", "failed", "cancelled"}
_DOWNLOAD_KEYS = ("images", "video", "audio")
_STATUS_ALIASES = {
    "success": "completed",
    "execution_success": "completed",
    "error": "failed",
    "execution_error": "failed",
}


class ComfyCloudError(RuntimeError):
    """Raised when a Comfy Cloud request or job fails."""


@dataclass(frozen=True)
class CloudFileRef:
    """Reference to a file known to Comfy Cloud."""

    filename: str
    subfolder: str = ""
    type: str = "output"

    def as_query_params(self) -> Dict[str, str]:
        return {
            "filename": self.filename,
            "subfolder": self.subfolder,
            "type": self.type,
        }

    def as_workflow_value(self, *, filename_only: bool = True) -> Any:
        if filename_only:
            return self.filename
        return self.as_query_params()


@dataclass
class JobResult:
    """Final result of a Comfy Cloud workflow run."""

    prompt_id: str
    status: str
    outputs: Dict[str, Any]
    history: Dict[str, Any] = field(default_factory=dict)
    downloaded_files: List[Path] = field(default_factory=list)


def load_workflow(path: os.PathLike[str] | str) -> Dict[str, Any]:
    """Load a ComfyUI API-format workflow JSON file."""
    workflow_path = Path(path)
    with workflow_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ComfyCloudError(f"Workflow must be a JSON object: {workflow_path}")
    return data


def clone_workflow(workflow: Mapping[str, Any]) -> Dict[str, Any]:
    """Deep-copy a workflow so caller data is not mutated."""
    return copy.deepcopy(dict(workflow))


def set_workflow_input(
    workflow: Mapping[str, Any],
    node_id: str | int,
    input_name: str,
    value: Any,
    *,
    inplace: bool = False,
) -> Dict[str, Any]:
    """Set one workflow input value."""
    target = workflow if inplace else clone_workflow(workflow)
    node_key = str(node_id)
    if node_key not in target:
        raise ComfyCloudError(f"Workflow node not found: {node_key}")

    node = target[node_key]
    if not isinstance(node, MutableMapping):
        raise ComfyCloudError(f"Workflow node is not an object: {node_key}")

    inputs = node.setdefault("inputs", {})
    if not isinstance(inputs, MutableMapping):
        raise ComfyCloudError(f"Workflow node inputs is not an object: {node_key}")

    inputs[input_name] = value
    return target


def set_workflow_inputs(
    workflow: Mapping[str, Any],
    updates: Mapping[str | int, Mapping[str, Any]],
    *,
    inplace: bool = False,
) -> Dict[str, Any]:
    """Apply multiple workflow input updates."""
    target = workflow if inplace else clone_workflow(workflow)
    for node_id, input_map in updates.items():
        for input_name, value in input_map.items():
            set_workflow_input(target, str(node_id), input_name, value, inplace=True)
    return target


class ComfyCloudClient:
    """Small Comfy Cloud REST client focused on workflow execution."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: str = _DEFAULT_BASE_URL,
        timeout: int = _DEFAULT_TIMEOUT,
        session: Optional[requests.Session] = None,
    ) -> None:
        key = api_key or os.environ.get("COMFY_CLOUD_API_KEY")
        if not key:
            raise ComfyCloudError("COMFY_CLOUD_API_KEY is not set.")

        self.api_key = key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers.update({"X-API-Key": self.api_key})

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _normalize_status(self, status: Any) -> str:
        value = str(status or "").strip().lower()
        return _STATUS_ALIASES.get(value, value)

    def _request(
        self,
        method: str,
        path: str,
        *,
        expected_status: Optional[Sequence[int]] = None,
        **kwargs: Any,
    ) -> requests.Response:
        response = self.session.request(
            method,
            self._url(path),
            timeout=self.timeout,
            **kwargs,
        )

        allowed = tuple(expected_status or ())
        ok = response.status_code in allowed if allowed else response.ok
        if ok:
            return response

        preview = response.text[:400].strip()
        raise ComfyCloudError(
            f"Comfy Cloud {method} {path} failed with HTTP {response.status_code}: {preview}"
        )

    def upload_image(
        self,
        image_path: os.PathLike[str] | str,
        *,
        type: str = "input",
        overwrite: bool = True,
    ) -> CloudFileRef:
        """
        Upload an image for workflow use.

        The returned filename can usually be wired into a LoadImage node's
        `image` input. If your node expects a richer object, use
        `CloudFileRef.as_workflow_value(filename_only=False)`.
        """
        path = Path(image_path)
        if not path.is_file():
            raise ComfyCloudError(f"Image file not found: {path}")

        with path.open("rb") as handle:
            response = self._request(
                "POST",
                "/api/upload/image",
                files={"image": (path.name, handle)},
                data={
                    "type": type,
                    "overwrite": str(overwrite).lower(),
                },
            )

        payload = response.json()
        filename = payload.get("name") or payload.get("filename") or path.name
        return CloudFileRef(
            filename=filename,
            subfolder=payload.get("subfolder", ""),
            type=payload.get("type", type),
        )

    def submit_workflow(
        self,
        workflow: Mapping[str, Any],
        *,
        extra_data: Optional[Mapping[str, Any]] = None,
        include_api_key_for_partner_nodes: bool = False,
    ) -> str:
        """Submit a workflow and return the prompt_id."""
        payload: Dict[str, Any] = {"prompt": dict(workflow)}
        merged_extra_data: Dict[str, Any] = {}
        if extra_data:
            merged_extra_data.update(dict(extra_data))
        if include_api_key_for_partner_nodes:
            merged_extra_data.setdefault("api_key_comfy_org", self.api_key)
        if merged_extra_data:
            payload["extra_data"] = merged_extra_data

        response = self._request("POST", "/api/prompt", json=payload)
        data = response.json()
        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise ComfyCloudError(f"Comfy Cloud did not return prompt_id: {data}")
        return str(prompt_id)

    def get_job_status(self, prompt_id: str) -> str:
        """Return job status: pending, in_progress, completed, failed, or cancelled."""
        response = self._request("GET", f"/api/job/{prompt_id}/status")
        data = response.json()
        status = data.get("status")
        if not status:
            raise ComfyCloudError(f"Missing job status for {prompt_id}: {data}")
        return self._normalize_status(status)

    def wait_for_completion(
        self,
        prompt_id: str,
        *,
        timeout: float = 300.0,
        poll_interval: float = _DEFAULT_POLL_INTERVAL,
    ) -> str:
        """Poll the status endpoint until the job finishes or times out."""
        started = time.monotonic()
        last_status = ""

        while True:
            status = self.get_job_status(prompt_id)
            last_status = status
            if status in _FINAL_STATUSES:
                return status

            elapsed = time.monotonic() - started
            if elapsed >= timeout:
                raise ComfyCloudError(
                    f"Job {prompt_id} timed out after {timeout:.1f}s. Last status: {last_status}"
                )
            time.sleep(poll_interval)

    def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """
        Fetch history for a specific prompt.

        Docs examples show two possible shapes:
            1. direct entry object with `outputs`
            2. object keyed by prompt_id containing the entry
        This method normalizes both to the history entry object.
        """
        response = self._request("GET", f"/api/history_v2/{prompt_id}")
        data = response.json()

        if isinstance(data, dict) and "outputs" in data:
            return data
        if isinstance(data, dict) and prompt_id in data and isinstance(data[prompt_id], dict):
            return data[prompt_id]
        if isinstance(data, dict) and len(data) == 1:
            only_value = next(iter(data.values()))
            if isinstance(only_value, dict) and "outputs" in only_value:
                return only_value

        raise ComfyCloudError(f"Unexpected history payload for {prompt_id}: {data}")

    def get_outputs(self, prompt_id: str) -> Dict[str, Any]:
        """Fetch just the outputs map from history."""
        history = self.get_history(prompt_id)
        outputs = history.get("outputs", {})
        if not isinstance(outputs, dict):
            raise ComfyCloudError(f"Unexpected outputs payload for {prompt_id}: {outputs}")
        return outputs

    def iter_output_files(
        self,
        outputs: Mapping[str, Any],
        *,
        keys: Iterable[str] = _DOWNLOAD_KEYS,
    ) -> Iterable[Tuple[str, CloudFileRef]]:
        """Yield `(node_id, file_ref)` for image/video/audio outputs."""
        for node_id, node_output in outputs.items():
            if not isinstance(node_output, Mapping):
                continue
            for key in keys:
                for file_info in node_output.get(key, []) or []:
                    if not isinstance(file_info, Mapping):
                        continue
                    filename = file_info.get("filename")
                    if not filename:
                        continue
                    yield str(node_id), CloudFileRef(
                        filename=str(filename),
                        subfolder=str(file_info.get("subfolder", "")),
                        type=str(file_info.get("type", "output")),
                    )

    def download_file(
        self,
        file_ref: CloudFileRef,
        *,
        output_dir: os.PathLike[str] | str,
        overwrite: bool = True,
        filename: Optional[str] = None,
    ) -> Path:
        """Download one generated output file to disk."""
        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        target_path = out_dir / (filename or file_ref.filename)
        if target_path.exists() and not overwrite:
            raise ComfyCloudError(f"Output file already exists: {target_path}")

        query = urlencode(file_ref.as_query_params())
        redirect_response = self._request(
            "GET",
            f"/api/view?{query}",
            expected_status=(302,),
            allow_redirects=False,
        )
        signed_url = redirect_response.headers.get("Location")
        if not signed_url:
            raise ComfyCloudError(f"Missing signed download URL for {file_ref.filename}")

        file_response = requests.get(signed_url, timeout=self.timeout)
        if not file_response.ok:
            raise ComfyCloudError(
                f"Download failed for {file_ref.filename}: HTTP {file_response.status_code}"
            )
        target_path.write_bytes(file_response.content)
        return target_path

    def download_outputs(
        self,
        outputs: Mapping[str, Any],
        *,
        output_dir: os.PathLike[str] | str,
        overwrite: bool = True,
    ) -> List[Path]:
        """Download all image/video/audio outputs to a directory."""
        downloaded: List[Path] = []
        for _node_id, file_ref in self.iter_output_files(outputs):
            downloaded.append(
                self.download_file(
                    file_ref,
                    output_dir=output_dir,
                    overwrite=overwrite,
                )
            )
        return downloaded

    def run_workflow(
        self,
        workflow: Mapping[str, Any],
        *,
        extra_data: Optional[Mapping[str, Any]] = None,
        include_api_key_for_partner_nodes: bool = False,
        timeout: float = 300.0,
        poll_interval: float = _DEFAULT_POLL_INTERVAL,
        download_output_dir: Optional[os.PathLike[str] | str] = None,
        overwrite_outputs: bool = True,
    ) -> JobResult:
        """
        Submit a workflow, wait for completion, fetch outputs, and optionally download them.
        """
        prompt_id = self.submit_workflow(
            workflow,
            extra_data=extra_data,
            include_api_key_for_partner_nodes=include_api_key_for_partner_nodes,
        )
        status = self.wait_for_completion(
            prompt_id,
            timeout=timeout,
            poll_interval=poll_interval,
        )

        if status != "completed":
            raise ComfyCloudError(f"Job {prompt_id} finished with status {status}")

        history = self.get_history(prompt_id)
        outputs = history.get("outputs", {})
        downloaded_files: List[Path] = []
        if download_output_dir is not None:
            downloaded_files = self.download_outputs(
                outputs,
                output_dir=download_output_dir,
                overwrite=overwrite_outputs,
            )

        return JobResult(
            prompt_id=prompt_id,
            status=status,
            outputs=dict(outputs),
            history=history,
            downloaded_files=downloaded_files,
        )
