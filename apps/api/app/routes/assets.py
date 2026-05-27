from __future__ import annotations

import re
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from ..db_helpers import get_owned_asset, get_owned_project, get_project_version
from ..errors import supabase_http_error
from ..schemas import SignedUploadCreate, SignedUploadResponse, SignedUrlResponse, UserContext
from ..security import get_current_user
from ..settings import settings
from ..supabase_client import SupabaseConfigError, SupabaseRequestError, supabase

router = APIRouter()


@router.get("/{asset_id}/signed-url", response_model=SignedUrlResponse)
async def get_signed_url(
    asset_id: UUID,
    user: UserContext = Depends(get_current_user),
) -> SignedUrlResponse:
    try:
        asset = get_owned_asset(asset_id, user.user_id)
        expires_in = settings.signed_url_expires_in
        url = supabase.signed_download_url(
            asset["storage_bucket"],
            asset["storage_path"],
            expires_in,
        )
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return SignedUrlResponse(asset_id=asset_id, url=url, expires_in=expires_in)


@router.post("/signed-upload", response_model=SignedUploadResponse, status_code=status.HTTP_201_CREATED)
async def create_signed_upload(
    payload: SignedUploadCreate,
    user: UserContext = Depends(get_current_user),
) -> SignedUploadResponse:
    """Create an asset row and a short-lived Supabase Storage upload URL."""
    try:
        get_owned_project(payload.project_id, user.user_id)
        if payload.version_id:
            get_project_version(payload.project_id, payload.version_id)
        bucket = payload.storage_bucket or settings.supabase_storage_bucket
        storage_path = _asset_storage_path(user.user_id, payload.project_id, payload.filename)
        rows = supabase.insert(
            "assets",
            {
                "user_id": str(user.user_id),
                "project_id": str(payload.project_id),
                "version_id": str(payload.version_id) if payload.version_id else None,
                "type": payload.type,
                "storage_bucket": bucket,
                "storage_path": storage_path,
                "mime_type": payload.mime_type,
                "width": payload.width,
                "height": payload.height,
                "size_bytes": payload.size_bytes,
            },
        )
        if not rows:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Asset was not created.")
        asset = rows[0]
        url = supabase.signed_upload_url(bucket, storage_path)
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return SignedUploadResponse(
        asset_id=asset["id"],
        storage_bucket=bucket,
        storage_path=storage_path,
        url=url,
        expires_in=settings.signed_url_expires_in,
    )


def _asset_storage_path(user_id: UUID, project_id: UUID, filename: str) -> str:
    safe_filename = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-")
    if not safe_filename:
        safe_filename = "upload.bin"
    return f"{user_id}/{project_id}/{uuid4()}-{safe_filename}"
