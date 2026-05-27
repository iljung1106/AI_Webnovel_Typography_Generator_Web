from __future__ import annotations

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
)
from ..security import get_current_user
from ..supabase_client import SupabaseConfigError, SupabaseRequestError, supabase

router = APIRouter()


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
    return ProjectVersionResponse(**rows[0])


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
            return ProjectVersionResponse(**version)
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
    return ProjectVersionResponse(**rows[0])
