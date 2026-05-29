from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db_helpers import JOB_COLUMNS, get_owned_project, get_project_version
from ..errors import supabase_http_error
from ..schemas import JobCreate, JobResponse, UserContext
from ..security import get_current_user
from ..supabase_client import SupabaseConfigError, SupabaseRequestError, supabase

router = APIRouter()

FREE_GENERATION_DAILY_LIMIT = 3
ACTIVE_JOB_STATUSES = "in.(queued,running)"


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    user: UserContext = Depends(get_current_user),
) -> JobResponse:
    try:
        get_owned_project(payload.project_id, user.user_id)
        get_project_version(payload.project_id, payload.version_id)
        if payload.type == "typography_generation":
            active_job = _active_generation_job(payload.project_id, payload.version_id, user.user_id)
            if active_job:
                active_job["result_json"] = _generation_result_json(active_job)
                return _job_response(active_job)
            _enforce_generation_rate_limit(user.user_id)
            credit_source = str(payload.input_json.get("credit_source") or "free")
            if credit_source == "free":
                _consume_free_generation_credit(user.user_id)
            elif credit_source == "paid":
                _ensure_paid_credit(user.user_id, float(payload.input_json.get("credit_cost_total") or 0))
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credit source.")
        rows = supabase.insert(
            "jobs",
            {
                "user_id": str(user.user_id),
                "project_id": str(payload.project_id),
                "version_id": str(payload.version_id),
                "type": payload.type,
                "status": "queued",
                "input_json": payload.input_json,
                "idempotency_key": _job_idempotency_key(payload) if payload.type == "typography_generation" else None,
            },
        )
        if not rows:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Job was not created.")
        job = rows[0]
        _record_job_event(job["id"], "job_created", job["status"])
        if payload.type == "typography_generation":
            job = _create_generation_batch(job, payload, user.user_id)
            _mark_version_status(payload.version_id, "generating")
            _merge_version_workflow_state(
                payload.version_id,
                current_step="generation",
                state_patch={
                    "generation": {
                        "jobId": job["id"],
                        "status": job["status"],
                        "creditSource": str(payload.input_json.get("credit_source") or "free"),
                        "slots": (job.get("result_json") or {}).get("slots", []),
                        "selectedCandidateId": "",
                    },
                },
            )
        elif payload.type == "layout_generation":
            _merge_version_workflow_state(
                payload.version_id,
                current_step="layout",
                state_patch={
                    "layout": {
                        "jobId": job["id"],
                        "status": job["status"],
                        "items": [],
                        "canvas": None,
                    },
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
        elif payload.type == "style_resolution":
            _merge_version_workflow_state(
                payload.version_id,
                current_step="style",
                state_patch={
                    "style": {
                        "userPrompt": ", ".join(str(item) for item in payload.input_json.get("keywords", [])),
                        "jobId": job["id"],
                        "status": job["status"],
                    },
                    "generation": {
                        "jobId": None,
                        "status": None,
                        "slots": [],
                        "selectedCandidateId": "",
                    },
                },
            )
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return _job_response(job)


@router.get("/active", response_model=JobResponse)
async def get_active_job(
    project_id: UUID = Query(),
    version_id: UUID = Query(),
    type: str = Query(default="typography_generation"),
    user: UserContext = Depends(get_current_user),
) -> JobResponse:
    if type != "typography_generation":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported active job type.")
    try:
        get_owned_project(project_id, user.user_id)
        get_project_version(project_id, version_id)
        active_job = _active_generation_job(project_id, version_id, user.user_id)
        if not active_job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active job not found.")
        active_job["result_json"] = _generation_result_json(active_job)
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return _job_response(active_job)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: UUID,
    user: UserContext = Depends(get_current_user),
) -> JobResponse:
    try:
        rows = supabase.select(
            "jobs",
            {
                "select": JOB_COLUMNS,
                "id": f"eq.{job_id}",
                "user_id": f"eq.{user.user_id}",
                "limit": "1",
            },
        )
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
        job = rows[0]
        if job["type"] == "typography_generation":
            job["result_json"] = _generation_result_json(job)
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return _job_response(job)


def _create_generation_batch(job: dict, payload: JobCreate, user_id: UUID) -> dict:
    credit_source = str(payload.input_json.get("credit_source") or "free")
    sample_count = min(max(int(payload.input_json.get("sample_count") or 3), 1), 3)
    batch_rows = supabase.insert(
        "generation_batches",
        {
            "user_id": str(user_id),
            "project_id": str(payload.project_id),
            "version_id": str(payload.version_id),
            "job_id": job["id"],
            "status": "queued",
            "credit_source": credit_source,
            "free_usage_date": _today_key() if credit_source == "free" else None,
            "paid_credit_spent": float(payload.input_json.get("credit_cost_total") or 0)
            if credit_source == "paid"
            else 0,
            "sample_count": sample_count,
        },
    )
    if not batch_rows:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Generation batch was not created.",
        )
    batch = batch_rows[0]
    if credit_source == "paid":
        _spend_paid_credit(
            user_id=user_id,
            amount=float(payload.input_json.get("credit_cost_total") or 0),
            project_id=payload.project_id,
            batch_id=batch["id"],
        )
    slot_payloads = [
        {
            "batch_id": batch["id"],
            "slot_index": slot_index,
            "status": "queued",
            "credit_cost": 0,
            "credit_refunded": 0,
        }
        for slot_index in range(1, sample_count + 1)
    ]
    supabase.insert("generation_slots", slot_payloads)
    result_json = _generation_result_json(job, batch_id=batch["id"])
    updated = supabase.update(
        "jobs",
        {"select": JOB_COLUMNS, "id": f"eq.{job['id']}", "user_id": f"eq.{user_id}"},
        {"result_json": result_json},
    )
    return updated[0] if updated else {**job, "result_json": result_json}


def _active_generation_job(project_id: UUID, version_id: UUID, user_id: UUID) -> dict | None:
    rows = supabase.select(
        "jobs",
        {
            "select": JOB_COLUMNS,
            "user_id": f"eq.{user_id}",
            "project_id": f"eq.{project_id}",
            "version_id": f"eq.{version_id}",
            "type": "eq.typography_generation",
            "status": ACTIVE_JOB_STATUSES,
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    return rows[0] if rows else None


def _consume_free_generation_credit(user_id: UUID) -> None:
    usage_date = _today_key()
    rows = supabase.select(
        "daily_free_credit_usage",
        {
            "select": "user_id,usage_date,generation_batches_used",
            "user_id": f"eq.{user_id}",
            "usage_date": f"eq.{usage_date}",
            "limit": "1",
        },
    )
    if rows:
        used = int(rows[0]["generation_batches_used"])
        if used >= FREE_GENERATION_DAILY_LIMIT:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="오늘의 무료 생성 횟수를 모두 사용했어요.")
        supabase.update(
            "daily_free_credit_usage",
            {
                "user_id": f"eq.{user_id}",
                "usage_date": f"eq.{usage_date}",
            },
            {
                "generation_batches_used": used + 1,
                "updated_at": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
            },
        )
        return
    supabase.insert(
        "daily_free_credit_usage",
        {
            "user_id": str(user_id),
            "usage_date": usage_date,
            "generation_batches_used": 1,
        },
    )


def _ensure_paid_credit(user_id: UUID, required_amount: float) -> None:
    if required_amount <= 0:
        return
    balance = _paid_credit_balance(user_id)
    if balance < required_amount:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="유료 크레딧이 부족해요.")


def _paid_credit_balance(user_id: UUID) -> float:
    rows = supabase.select(
        "credit_ledger",
        {
            "select": "amount",
            "user_id": f"eq.{user_id}",
            "credit_type": "eq.paid_credit",
        },
    )
    return sum(float(row.get("amount") or 0) for row in rows)


def _spend_paid_credit(user_id: UUID, amount: float, project_id: UUID, batch_id: str) -> None:
    if amount <= 0:
        return
    balance = _paid_credit_balance(user_id)
    if balance < amount:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="유료 크레딧이 부족해요.")
    supabase.insert(
        "credit_ledger",
        {
            "user_id": str(user_id),
            "credit_type": "paid_credit",
            "type": "generation_charge",
            "amount": -amount,
            "balance_after": balance - amount,
            "related_project_id": str(project_id),
            "related_batch_id": str(batch_id),
            "reason": "generation_charge",
            "memo": "타이포 시안 생성",
        },
    )


def _enforce_generation_rate_limit(user_id: UUID) -> None:
    window_start = datetime.now(ZoneInfo("Asia/Seoul")).replace(second=0, microsecond=0).isoformat()
    key = "typography_generation:create"
    rows = supabase.select(
        "api_rate_limits",
        {
            "select": "id,count",
            "user_id": f"eq.{user_id}",
            "key": f"eq.{key}",
            "window_start": f"eq.{window_start}",
            "limit": "1",
        },
    )
    if rows:
        count = int(rows[0].get("count") or 0)
        if count >= 1:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="잠시 후 다시 시도해주세요.")
        supabase.update(
            "api_rate_limits",
            {"id": f"eq.{rows[0]['id']}"},
            {"count": count + 1, "updated_at": datetime.now(ZoneInfo("Asia/Seoul")).isoformat()},
        )
        return
    supabase.insert(
        "api_rate_limits",
        {
            "user_id": str(user_id),
            "key": key,
            "window_start": window_start,
            "count": 1,
        },
    )


def _record_job_event(job_id: str, event_type: str, job_status: str, message: str | None = None) -> None:
    try:
        supabase.insert(
            "job_events",
            {
                "job_id": job_id,
                "event_type": event_type,
                "status": job_status,
                "message": message,
            },
        )
    except (SupabaseConfigError, SupabaseRequestError):
        # Job event logging should not make the primary request fail.
        return


def _mark_version_status(version_id: UUID, version_status: str) -> None:
    try:
        supabase.update("project_versions", {"id": f"eq.{version_id}"}, {"status": version_status})
    except (SupabaseConfigError, SupabaseRequestError):
        return


def _merge_version_workflow_state(
    version_id: UUID,
    *,
    current_step: str,
    state_patch: dict[str, Any],
) -> None:
    rows = supabase.select(
        "project_versions",
        {
            "select": "workflow_state_json,save_revision",
            "id": f"eq.{version_id}",
            "limit": "1",
        },
    )
    if not rows:
        return
    current_state = rows[0].get("workflow_state_json") or {}
    if not isinstance(current_state, dict):
        current_state = {}
    next_state = _deep_merge_dicts(current_state, state_patch)
    next_state.setdefault("schemaVersion", 1)
    next_state.setdefault("activeStepId", current_step)
    supabase.update(
        "project_versions",
        {"id": f"eq.{version_id}"},
        {
            "current_step": current_step,
            "workflow_state_json": next_state,
            "save_revision": int(rows[0].get("save_revision") or 0) + 1,
            "last_saved_at": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        },
    )


def _deep_merge_dicts(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def _job_idempotency_key(payload: JobCreate) -> str:
    return f"{payload.type}:{payload.project_id}:{payload.version_id}"


def _today_key() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()


def _generation_result_json(job: dict, batch_id: str | None = None) -> dict:
    batch_rows = supabase.select(
        "generation_batches",
        {
            "select": "id,status,credit_source,paid_credit_spent",
            "job_id": f"eq.{job['id']}",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    if not batch_rows and not batch_id:
        return job.get("result_json") or {}
    batch = batch_rows[0] if batch_rows else {"id": batch_id}
    slot_rows = supabase.select(
        "generation_slots",
        {
            "select": (
                "slot_index,status,candidate_asset_id,transparent_asset_id,"
                "error_code,credit_refunded"
            ),
            "batch_id": f"eq.{batch['id']}",
            "order": "slot_index.asc",
        },
    )
    return {
        "batch_id": batch["id"],
        "credit_source": batch.get("credit_source") or "free",
        "paid_credit_spent": batch.get("paid_credit_spent", 0),
        "slots": [
            {
                "slot_index": row["slot_index"],
                "status": row["status"],
                "candidate_asset_id": row.get("candidate_asset_id"),
                "transparent_asset_id": row.get("transparent_asset_id"),
                "error_code": row.get("error_code"),
                "credit_refunded": row.get("credit_refunded", 0),
            }
            for row in slot_rows
        ],
    }


def _job_response(job: dict) -> JobResponse:
    return JobResponse(
        id=job["id"],
        project_id=job["project_id"],
        version_id=job["version_id"],
        type=job["type"],
        status=job["status"],
        result_json=job.get("result_json") or {},
        error_code=job.get("error_code"),
        error_message=job.get("error_message"),
    )
