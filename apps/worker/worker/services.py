from __future__ import annotations

import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import prototype_adapters
from .models import HandlerResult, Job
from .settings import Settings
from .status import utc_now_iso
from .supabase_client import SupabaseRestClient


CANVAS = {"width": 2000, "height": 1000}
DEFAULT_SAMPLE_COUNT = 3
MAX_SAMPLE_COUNT = 3


@dataclass(frozen=True)
class WorkerContext:
    db: SupabaseRestClient
    settings: Settings


class LayoutGenerationService:
    def __init__(self, context: WorkerContext) -> None:
        self.context = context

    def handle(self, job: Job) -> HandlerResult:
        title = _required_str(job.input_json, "title")
        items = prototype_adapters.generate_layout_items(title)
        result = {"items": items, "canvas": CANVAS}
        if job.version_id:
            self.context.db.patch_project_version(job.version_id, {"layout_json": result})
            self.context.db.merge_project_version_workflow_state(
                job.version_id,
                current_step="layout",
                state_patch={
                    "layout": result,
                    "style": {
                        "jobId": None,
                        "status": None,
                        "prompt": "",
                        "resolvedElements": [],
                        "resolvedStyles": [],
                    },
                    "generation": {
                        "jobId": None,
                        "status": None,
                        "slots": [],
                        "selectedCandidateId": "",
                    },
                },
            )
        return HandlerResult(status="succeeded", result_json=result)


class StyleResolutionService:
    def __init__(self, context: WorkerContext) -> None:
        self.context = context

    def handle(self, job: Job) -> HandlerResult:
        title = _required_str(job.input_json, "title")
        keywords = _str_list(job.input_json.get("keywords"))
        required_elements = _str_list(job.input_json.get("required_elements"))
        genre_profile = str(job.input_json.get("genre_profile") or "").strip()
        extra_instructions = str(job.input_json.get("extra_instructions") or "").strip()
        keep_visible = bool(job.input_json.get("keep_original_text_visible", True))

        prompt = prototype_adapters.resolve_style_prompt(
            title=title,
            keywords=keywords,
            required_elements=required_elements,
            genre_profile=genre_profile,
            extra_instructions=extra_instructions,
            keep_original_text_visible=keep_visible,
        )
        element_terms = _clean_display_terms(
            _extract_prompt_bullets(prompt, "ELEMENTS TO ADD:") or required_elements
        )
        style_terms = _clean_display_terms(_extract_prompt_bullets(prompt, "STYLE:") or keywords)
        result = {
            "prompt": prompt,
            "display": {
                "elements": element_terms,
                "style": style_terms,
            },
        }
        if job.version_id:
            self.context.db.patch_project_version(
                job.version_id,
                {
                    "style_input_json": job.input_json,
                    "style_resolved_json": result,
                },
            )
            self.context.db.merge_project_version_workflow_state(
                job.version_id,
                current_step="style",
                state_patch={
                    "style": {
                        "userPrompt": ", ".join(keywords),
                        "prompt": prompt,
                        "resolvedElements": element_terms,
                        "resolvedStyles": style_terms,
                        "jobId": job.id,
                        "status": "succeeded",
                    },
                    "generation": {
                        "jobId": None,
                        "status": None,
                        "slots": [],
                        "selectedCandidateId": "",
                    },
                },
            )
        return HandlerResult(status="succeeded", result_json=result)


class TypographyGenerationService:
    def __init__(self, context: WorkerContext) -> None:
        self.context = context

    def handle(self, job: Job) -> HandlerResult:
        prompt = _required_str(job.input_json, "prompt")
        sample_count = _sample_count(job.input_json.get("sample_count"))
        seeds = _seeds(job.input_json.get("seeds"), sample_count)
        title = str(job.input_json.get("title") or job.id).strip()
        output_dir = self._output_dir(job)
        filename_prefix = _safe_slug(title)
        input_image_path = _typography_input_image_path(
            job=job,
            output_dir=output_dir,
            filename_prefix=filename_prefix,
        )

        batch = self.context.db.ensure_generation_batch(
            job=job,
            credit_cost_total=float(job.input_json.get("credit_cost_total") or 0),
        )
        batch_id = str(batch["id"])
        slots = self.context.db.ensure_generation_slots(
            batch_id=batch_id,
            seeds=seeds,
            credit_cost=float(job.input_json.get("slot_credit_cost") or 0),
        )
        self.context.db.update_generation_batch(batch_id, {"status": "running"})
        for slot in slots:
            self.context.db.update_generation_slot(
                str(slot["id"]),
                {
                    "status": "running",
                    "started_at": slot.get("started_at") or utc_now_iso(),
                },
            )

        try:
            results = prototype_adapters.generate_typography_candidates_resilient(
                input_image_path=input_image_path,
                prompt=prompt,
                seeds=seeds,
                output_dir=output_dir,
                filename_prefix=filename_prefix,
            )
        except Exception:
            refunded_total = self._mark_slots_failed(slots, "comfy_failed")
            self.context.db.update_generation_batch(
                batch_id,
                {
                    "status": "failed",
                    "credit_refunded_total": refunded_total,
                    "finished_at": utc_now_iso(),
                },
            )
            raise

        slot_results = self._persist_candidate_results(
            job=job,
            batch_id=batch_id,
            slots=slots,
            seeds=seeds,
            generator_results=list(results),
        )
        succeeded_count = sum(1 for slot in slot_results if slot["status"] == "succeeded")
        if succeeded_count == len(slot_results):
            job_status = "succeeded"
            batch_status = "succeeded"
        elif succeeded_count > 0:
            job_status = "partially_succeeded"
            batch_status = "partially_succeeded"
        else:
            job_status = "failed"
            batch_status = "failed"

        self.context.db.update_generation_batch(
            batch_id,
            {
                "status": batch_status,
                "credit_refunded_total": sum(
                    float(slot.get("credit_refunded") or 0) for slot in slot_results
                ),
                "finished_at": utc_now_iso(),
            },
        )
        if job.version_id:
            self.context.db.patch_project_version(
                job.version_id,
                {"status": "generated" if succeeded_count > 0 else "failed"},
            )
            self.context.db.merge_project_version_workflow_state(
                job.version_id,
                current_step="generation",
                state_patch={
                    "generation": {
                        "jobId": job.id,
                        "status": job_status,
                        "creditSource": str(job.input_json.get("credit_source") or "free"),
                        "slots": slot_results,
                    },
                },
            )
        return HandlerResult(
            status=job_status,
            result_json={
                "batch_id": batch_id,
                "slots": slot_results,
            },
        )

    def _mark_slots_failed(self, slots: list[dict[str, Any]], status: str) -> float:
        refunded_total = 0.0
        for slot in slots:
            if slot.get("status") in {"succeeded", "download_failed", "comfy_failed"}:
                continue
            credit_refunded = slot.get("credit_cost", 0)
            refunded_total += float(credit_refunded or 0)
            self.context.db.update_generation_slot(
                str(slot["id"]),
                {
                    "status": status,
                    "error_code": "GenerationFailed",
                    "credit_refunded": credit_refunded,
                    "finished_at": utc_now_iso(),
                },
            )
        return refunded_total

    def _persist_candidate_results(
        self,
        *,
        job: Job,
        batch_id: str,
        slots: list[dict[str, Any]],
        seeds: list[int],
        generator_results: list[Any],
    ) -> list[dict[str, Any]]:
        slot_results: list[dict[str, Any]] = []
        for index, seed in enumerate(seeds, start=1):
            slot = _slot_for_index(slots, index)
            generator_result = generator_results[index - 1] if index <= len(generator_results) else None
            image_path = _first_image_path(generator_result)
            if slot is None:
                continue
            failure_code = _candidate_failure_code(generator_result)
            if image_path is None:
                credit_refunded = slot.get("credit_cost", 0)
                status = "comfy_failed" if failure_code else "download_failed"
                payload = {
                    "status": status,
                    "error_code": failure_code or "NoImageFile",
                    "credit_refunded": credit_refunded,
                    "finished_at": utc_now_iso(),
                }
                self.context.db.update_generation_slot(str(slot["id"]), payload)
                slot_results.append(
                    {
                        "slot_index": index,
                        "status": status,
                        "candidate_asset_id": None,
                        "transparent_asset_id": None,
                        "error_code": failure_code or "NoImageFile",
                        "credit_refunded": credit_refunded,
                    }
                )
                continue

            preview_path = image_path
            if str(job.input_json.get("credit_source") or "free") == "free":
                preview_path = prototype_adapters.create_watermarked_preview(
                    image_path,
                    image_path.with_name(f"{image_path.stem}_watermarked.png"),
                )

            storage_path = self._candidate_storage_path(
                job=job,
                batch_id=batch_id,
                slot_index=index,
                image_path=preview_path,
            )
            asset = self.context.db.create_asset_for_file(
                file_path=preview_path,
                user_id=job.user_id,
                project_id=job.project_id,
                version_id=job.version_id,
                asset_type="candidate",
                bucket=self.context.settings.typography_results_bucket,
                storage_path=storage_path,
                upload=self.context.settings.upload_generated_assets,
            )
            transparent_path = prototype_adapters.create_transparent_bw_mask(
                image_path,
                image_path.with_name(f"{image_path.stem}_transparent.png"),
            )
            transparent_asset = self.context.db.create_asset_for_file(
                file_path=transparent_path,
                user_id=job.user_id,
                project_id=job.project_id,
                version_id=job.version_id,
                asset_type="transparent_bw",
                bucket=self.context.settings.typography_results_bucket,
                storage_path=self._transparent_storage_path(
                    job=job,
                    batch_id=batch_id,
                    slot_index=index,
                    image_path=transparent_path,
                ),
                upload=self.context.settings.upload_generated_assets,
            )
            slot_payload = {
                "status": "succeeded",
                "seed": seed,
                "comfy_prompt_id": getattr(generator_result, "prompt_id", None),
                "candidate_asset_id": asset["id"],
                "transparent_asset_id": transparent_asset["id"],
                "finished_at": utc_now_iso(),
            }
            self.context.db.update_generation_slot(str(slot["id"]), slot_payload)
            slot_results.append(
                {
                    "slot_index": index,
                    "status": "succeeded",
                    "candidate_asset_id": asset["id"],
                    "transparent_asset_id": transparent_asset["id"],
                    "credit_refunded": 0,
                }
            )
        return slot_results

    def _output_dir(self, job: Job) -> Path:
        raw_output_dir = job.input_json.get("output_dir")
        if raw_output_dir:
            output_dir = Path(str(raw_output_dir))
        else:
            output_dir = self.context.settings.worker_output_dir / job.id
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    def _candidate_storage_path(
        self,
        *,
        job: Job,
        batch_id: str,
        slot_index: int,
        image_path: Path,
    ) -> str:
        user_id = job.user_id
        project_id = job.project_id or "no-project"
        version_id = job.version_id or "no-version"
        return (
            f"{user_id}/{project_id}/{version_id}/{batch_id}/"
            f"slot_{slot_index}{image_path.suffix.lower() or '.png'}"
        )

    def _transparent_storage_path(
        self,
        *,
        job: Job,
        batch_id: str,
        slot_index: int,
        image_path: Path,
    ) -> str:
        user_id = job.user_id
        project_id = job.project_id or "no-project"
        version_id = job.version_id or "no-version"
        return (
            f"{user_id}/{project_id}/{version_id}/{batch_id}/"
            f"slot_{slot_index}_transparent{image_path.suffix.lower() or '.png'}"
        )


def build_registry(context: WorkerContext):
    from .registry import JobHandlerRegistry

    registry = JobHandlerRegistry()
    registry.register("layout_generation", LayoutGenerationService(context).handle)
    registry.register("style_resolution", StyleResolutionService(context).handle)
    registry.register("typography_generation", TypographyGenerationService(context).handle)
    return registry


def _required_str(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key) or "").strip()
    if not value:
        raise ValueError(f"{key} is required.")
    return value


def _typography_input_image_path(
    *,
    job: Job,
    output_dir: Path,
    filename_prefix: str,
) -> Path:
    raw_input_image_path = str(job.input_json.get("input_image_path") or "").strip()
    if raw_input_image_path:
        input_image_path = Path(raw_input_image_path)
        if not input_image_path.exists():
            raise FileNotFoundError(f"input_image_path does not exist: {input_image_path}")
        return input_image_path

    raw_items = _layout_items_payload(job.input_json)
    if raw_items is None:
        raise ValueError("input_image_path or items/layout_json.items is required.")

    items = prototype_adapters.layout_items_from_payload(raw_items)
    return prototype_adapters.render_layout_items_to_png(
        items,
        output_dir / f"{filename_prefix}_layout_input.png",
    )


def _layout_items_payload(payload: dict[str, Any]) -> Any:
    if "items" in payload and payload["items"] is not None:
        return payload["items"]

    layout_json = payload.get("layout_json")
    if isinstance(layout_json, dict):
        return layout_json.get("items")
    return None


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _sample_count(value: Any) -> int:
    try:
        count = int(value or DEFAULT_SAMPLE_COUNT)
    except (TypeError, ValueError):
        count = DEFAULT_SAMPLE_COUNT
    return max(1, min(MAX_SAMPLE_COUNT, count))


def _seeds(value: Any, sample_count: int) -> list[int]:
    if isinstance(value, list):
        parsed = []
        for raw in value[:sample_count]:
            try:
                parsed.append(int(raw))
            except (TypeError, ValueError):
                continue
        if len(parsed) == sample_count:
            return parsed
    base_seed = random.randint(10_000_000, 99_999_999)
    return [base_seed + index * 104_729 for index in range(sample_count)]


def _safe_slug(raw: str) -> str:
    text = re.sub(r"[^\w\u3131-\u318E\uAC00-\uD7A3-]+", "_", raw.strip(), flags=re.UNICODE)
    return text.strip("_")[:80] or "typography"


def _extract_prompt_bullets(prompt: str, header: str) -> list[str]:
    pattern = rf"{re.escape(header)}\s*(.*?)(?=\n[A-Z][A-Z:\s]+:|\Z)"
    match = re.search(pattern, prompt, flags=re.DOTALL)
    if not match:
        return []
    bullets = []
    for line in match.group(1).splitlines():
        line = line.strip()
        if line.startswith("- "):
            bullets.append(line[2:].strip())
    return bullets


def _clean_display_terms(values: list[str]) -> list[str]:
    terms: list[str] = []
    for value in values:
        term = str(value).strip()
        term = re.sub(r"\([^)]*\)", "", term)
        term = re.sub(r"\[[^\]]*\]", "", term)
        term = re.sub(r"[\"'`]", "", term)
        term = re.sub(r"\s+", " ", term).strip(" .,:;-/")
        if not term:
            continue
        if re.search(r"[\u3131-\u318E\uAC00-\uD7A3]", term):
            continue
        if len(term) > 48 or len(term.split()) > 6:
            continue
        terms.append(term)
    return list(dict.fromkeys(terms))[:8]


def _slot_for_index(slots: list[dict[str, Any]], slot_index: int) -> dict[str, Any] | None:
    for slot in slots:
        if int(slot.get("slot_index", 0)) == slot_index:
            return slot
    return None


def _first_image_path(generator_result: Any) -> Path | None:
    if generator_result is None:
        return None
    for raw_path in getattr(generator_result, "downloaded_files", []) or []:
        path = Path(raw_path)
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            return path
    return None


def _candidate_failure_code(generator_result: Any) -> str | None:
    error_code = getattr(generator_result, "error_code", None)
    if isinstance(error_code, str) and error_code.strip():
        return error_code.strip()[:120]
    return None
