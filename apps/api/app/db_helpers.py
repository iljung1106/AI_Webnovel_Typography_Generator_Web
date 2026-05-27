from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status

from .supabase_client import supabase


PROJECT_COLUMNS = "id,title,status,selected_genre_id,created_at,updated_at"
VERSION_COLUMNS = (
    "id,project_id,version_number,genre_id,title_text,cover_asset_id,"
    "layout_json,style_input_json,style_resolved_json,selected_candidate_id,"
    "effect_settings_json,cover_placement_json,created_at"
)
JOB_COLUMNS = (
    "id,user_id,project_id,version_id,type,status,input_json,result_json,"
    "error_code,error_message,timeout_at,started_at,finished_at,created_at"
)
ASSET_COLUMNS = (
    "id,user_id,project_id,version_id,type,storage_bucket,storage_path,"
    "mime_type,width,height,size_bytes,expires_at,created_at,deleted_at"
)


def first_or_404(rows: list[dict], detail: str) -> dict:
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return rows[0]


def get_owned_project(project_id: UUID, user_id: UUID) -> dict:
    rows = supabase.select(
        "projects",
        {
            "select": PROJECT_COLUMNS,
            "id": f"eq.{project_id}",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        },
    )
    return first_or_404(rows, "Project not found.")


def get_project_version(project_id: UUID, version_id: UUID) -> dict:
    rows = supabase.select(
        "project_versions",
        {
            "select": VERSION_COLUMNS,
            "id": f"eq.{version_id}",
            "project_id": f"eq.{project_id}",
            "limit": "1",
        },
    )
    return first_or_404(rows, "Project version not found.")


def get_owned_asset(asset_id: UUID, user_id: UUID) -> dict:
    rows = supabase.select(
        "assets",
        {
            "select": ASSET_COLUMNS,
            "id": f"eq.{asset_id}",
            "user_id": f"eq.{user_id}",
            "deleted_at": "is.null",
            "limit": "1",
        },
    )
    return first_or_404(rows, "Asset not found.")
