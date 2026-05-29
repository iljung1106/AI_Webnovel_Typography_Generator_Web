from __future__ import annotations

from datetime import datetime, timezone
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from ..db_helpers import VERSION_COLUMNS, get_owned_asset, get_owned_project, get_project_version
from ..errors import supabase_http_error
from ..schemas import (
    ProjectCreate,
    ProjectResponse,
    ProjectVersionResponse,
    UserContext,
    VersionCreate,
    VersionPatch,
    VersionStatePatch,
    WorkListItem,
)
from ..security import get_current_user
from ..supabase_client import SupabaseConfigError, SupabaseRequestError, supabase
from ..workflow_state import merge_client_workflow_state, normalize_workflow_state

router = APIRouter()
MAX_WORKFLOW_STATE_BYTES = 256_000


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    user: UserContext = Depends(get_current_user),
) -> ProjectResponse:
    try:
        rows = supabase.insert(
            "projects",
            {
                "user_id": str(user.user_id),
                "title": payload.title,
                "status": "draft",
                "selected_genre_id": str(payload.selected_genre_id)
                if payload.selected_genre_id
                else None,
            },
        )
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    if not rows:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Project was not created.")
    return ProjectResponse(**rows[0])


@router.get("", response_model=list[WorkListItem])
async def list_projects(
    user: UserContext = Depends(get_current_user),
) -> list[WorkListItem]:
    try:
        project_rows = supabase.select(
            "projects",
            {
                "select": "id,title,status,selected_genre_id,updated_at",
                "user_id": f"eq.{user.user_id}",
                "status": "neq.deleted",
                "order": "updated_at.desc",
                "limit": "40",
            },
        )
        items: list[WorkListItem] = []
        for project in project_rows:
            version = _latest_version(project["id"])
            active_job = _active_generation_job(project["id"], version["id"] if version else None, user.user_id)
            thumbnail_asset_id = None
            if version:
                thumbnail_asset_id = version.get("selected_candidate_id") or version.get("cover_asset_id")
            title = project.get("title") or (version.get("title_text") if version else "") or "타이포 작업"
            status_value = project.get("status", "draft")
            if active_job:
                status_value = "generating"
            elif version and version.get("current_step") == "export":
                status_value = "completed"
            items.append(
                WorkListItem(
                    project_id=project["id"],
                    version_id=version["id"] if version else None,
                    title=title,
                    genre=None,
                    status=status_value,
                    thumbnail_asset_id=thumbnail_asset_id,
                    thumbnail_expired=False,
                    active_job_id=active_job["id"] if active_job else None,
                    updated_at=project.get("updated_at"),
                    completed_at=None,
                )
            )
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return items


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    user: UserContext = Depends(get_current_user),
) -> ProjectResponse:
    try:
        project = get_owned_project(project_id, user.user_id)
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return ProjectResponse(**project)


@router.post(
    "/{project_id}/versions",
    response_model=ProjectVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_version(
    project_id: UUID,
    payload: VersionCreate,
    user: UserContext = Depends(get_current_user),
) -> ProjectVersionResponse:
    try:
        get_owned_project(project_id, user.user_id)
        if payload.cover_asset_id:
            asset = get_owned_asset(payload.cover_asset_id, user.user_id)
            if asset.get("project_id") and asset["project_id"] != str(project_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cover asset belongs to a different project.",
                )
        latest_rows = supabase.select(
            "project_versions",
            {
                "select": "version_number",
                "project_id": f"eq.{project_id}",
                "order": "version_number.desc",
                "limit": "1",
            },
        )
        version_number = (latest_rows[0]["version_number"] + 1) if latest_rows else 1
        rows = supabase.insert(
            "project_versions",
            {
                "project_id": str(project_id),
                "version_number": version_number,
                "genre_id": str(payload.genre_id) if payload.genre_id else None,
                "title_text": payload.title_text,
                "cover_asset_id": str(payload.cover_asset_id) if payload.cover_asset_id else None,
            },
        )
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Project version was not created.",
        )
    return _version_response(rows[0])


@router.patch("/{project_id}/versions/{version_id}", response_model=ProjectVersionResponse)
async def patch_project_version(
    project_id: UUID,
    version_id: UUID,
    payload: VersionPatch,
    user: UserContext = Depends(get_current_user),
) -> ProjectVersionResponse:
    try:
        get_owned_project(project_id, user.user_id)
        version = get_project_version(project_id, version_id)
        updates = payload.model_dump(exclude_unset=True)
        for key, value in list(updates.items()):
            if isinstance(value, UUID):
                updates[key] = str(value)
        if not updates:
            return _version_response(version)
        if payload.selected_candidate_id:
            asset = get_owned_asset(payload.selected_candidate_id, user.user_id)
            if asset.get("project_id") and asset["project_id"] != str(project_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected candidate asset belongs to a different project.",
                )
        rows = supabase.update(
            "project_versions",
            {
                "select": VERSION_COLUMNS,
                "id": f"eq.{version_id}",
                "project_id": f"eq.{project_id}",
            },
            updates,
        )
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project version not found.")
    return _version_response(rows[0])


@router.patch("/{project_id}/versions/{version_id}/state", response_model=ProjectVersionResponse)
async def patch_project_version_state(
    project_id: UUID,
    version_id: UUID,
    payload: VersionStatePatch,
    user: UserContext = Depends(get_current_user),
) -> ProjectVersionResponse:
    try:
        get_owned_project(project_id, user.user_id)
        version = get_project_version(project_id, version_id)
        encoded_state = json.dumps(payload.workflow_state_json, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        if len(encoded_state) > MAX_WORKFLOW_STATE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Workflow state is too large.",
            )
        if payload.base_revision is not None and payload.base_revision != version.get("save_revision", 0):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workflow state has changed. Please reload the latest version.",
            )

        now = datetime.now(timezone.utc).isoformat()
        next_revision = int(version.get("save_revision") or 0) + 1
        next_state = merge_client_workflow_state(
            version.get("workflow_state_json"),
            payload.workflow_state_json,
            current_step=payload.current_step,
        )
        encoded_next_state = json.dumps(next_state, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(encoded_next_state) > MAX_WORKFLOW_STATE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Workflow state is too large.",
            )
        params = {
            "select": VERSION_COLUMNS,
            "id": f"eq.{version_id}",
            "project_id": f"eq.{project_id}",
        }
        if payload.base_revision is not None:
            params["save_revision"] = f"eq.{version.get('save_revision', 0)}"
        rows = supabase.update(
            "project_versions",
            params,
            {
                "current_step": payload.current_step,
                "workflow_state_json": next_state,
                "save_revision": next_revision,
                "last_saved_at": now,
            },
        )
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Workflow state has changed. Please reload the latest version.",
            )
        supabase.update(
            "projects",
            {"id": f"eq.{project_id}", "user_id": f"eq.{user.user_id}"},
            {"updated_at": now},
        )
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return _version_response(rows[0])


@router.get("/{project_id}/versions/{version_id}", response_model=ProjectVersionResponse)
async def get_project_version_route(
    project_id: UUID,
    version_id: UUID,
    user: UserContext = Depends(get_current_user),
) -> ProjectVersionResponse:
    try:
        get_owned_project(project_id, user.user_id)
        version = get_project_version(project_id, version_id)
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return _version_response(version)


def _version_response(version: dict) -> ProjectVersionResponse:
    current_step = str(version.get("current_step") or "genre")
    return ProjectVersionResponse(
        **{
            **version,
            "current_step": current_step,
            "workflow_state_json": normalize_workflow_state(version.get("workflow_state_json"), current_step),
        }
    )


def _latest_version(project_id: str) -> dict | None:
    rows = supabase.select(
        "project_versions",
        {
            "select": VERSION_COLUMNS,
            "project_id": f"eq.{project_id}",
            "order": "version_number.desc",
            "limit": "1",
        },
    )
    return rows[0] if rows else None


def _active_generation_job(project_id: str, version_id: str | None, user_id: UUID) -> dict | None:
    if not version_id:
        return None
    rows = supabase.select(
        "jobs",
        {
            "select": "id,status",
            "user_id": f"eq.{user_id}",
            "project_id": f"eq.{project_id}",
            "version_id": f"eq.{version_id}",
            "type": "eq.typography_generation",
            "status": "in.(queued,running)",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    return rows[0] if rows else None
