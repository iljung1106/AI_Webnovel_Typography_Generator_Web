from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from ..db_helpers import JOB_COLUMNS, get_owned_project, get_project_version
from ..errors import supabase_http_error
from ..schemas import JobCreate, JobResponse, UserContext
from ..security import get_current_user
from ..supabase_client import SupabaseConfigError, SupabaseRequestError, supabase

router = APIRouter()


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    user: UserContext = Depends(get_current_user),
) -> JobResponse:
    try:
        get_owned_project(payload.project_id, user.user_id)
        get_project_version(payload.project_id, payload.version_id)
        rows = supabase.insert(
            "jobs",
            {
                "user_id": str(user.user_id),
                "project_id": str(payload.project_id),
                "version_id": str(payload.version_id),
                "type": payload.type,
                "status": "queued",
                "input_json": payload.input_json,
            },
        )
        if not rows:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Job was not created.")
        job = rows[0]
        if payload.type == "typography_generation":
            job = _create_generation_batch(job, payload, user.user_id)
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return _job_response(job)


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
    batch_rows = supabase.insert(
        "generation_batches",
        {
            "user_id": str(user_id),
            "project_id": str(payload.project_id),
            "version_id": str(payload.version_id),
            "job_id": job["id"],
            "status": "created",
        },
    )
    if not batch_rows:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Generation batch was not created.",
        )
    batch = batch_rows[0]
    slot_payloads = [
        {
            "batch_id": batch["id"],
            "slot_index": slot_index,
            "status": "queued",
            "credit_cost": 0,
            "credit_refunded": 0,
        }
        for slot_index in range(1, 4)
    ]
    supabase.insert("generation_slots", slot_payloads)
    result_json = _generation_result_json(job, batch_id=batch["id"])
    updated = supabase.update(
        "jobs",
        {"select": JOB_COLUMNS, "id": f"eq.{job['id']}", "user_id": f"eq.{user_id}"},
        {"result_json": result_json},
    )
    return updated[0] if updated else {**job, "result_json": result_json}


def _generation_result_json(job: dict, batch_id: str | None = None) -> dict:
    batch_rows = supabase.select(
        "generation_batches",
        {
            "select": "id,status",
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
