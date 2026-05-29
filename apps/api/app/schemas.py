from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class UserContext(BaseModel):
    user_id: UUID
    email: str | None = None


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    selected_genre_id: UUID | None = None


class ProjectResponse(BaseModel):
    id: UUID
    title: str
    status: str
    selected_genre_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WorkListItem(BaseModel):
    project_id: UUID
    version_id: UUID | None = None
    title: str
    genre: str | None = None
    status: str
    thumbnail_asset_id: UUID | None = None
    thumbnail_expired: bool = False
    active_job_id: UUID | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None


class VersionCreate(BaseModel):
    title_text: str = Field(min_length=1, max_length=160)
    genre_id: UUID | None = None
    cover_asset_id: UUID | None = None


class VersionPatch(BaseModel):
    layout_json: dict[str, Any] | None = None
    style_input_json: dict[str, Any] | None = None
    style_resolved_json: dict[str, Any] | None = None
    selected_candidate_id: UUID | None = None
    effect_settings_json: dict[str, Any] | None = None
    cover_placement_json: dict[str, Any] | None = None


WorkflowStep = Literal["genre", "cover", "title", "layout", "style", "generation", "effects", "export"]


class VersionStatePatch(BaseModel):
    current_step: WorkflowStep
    workflow_state_json: dict[str, Any] = Field(default_factory=dict)
    base_revision: int | None = Field(default=None, ge=0)


class ProjectVersionResponse(BaseModel):
    id: UUID
    project_id: UUID
    version_number: int | None = None
    title_text: str
    genre_id: UUID | None = None
    cover_asset_id: UUID | None = None
    layout_json: dict[str, Any] = Field(default_factory=dict)
    style_input_json: dict[str, Any] = Field(default_factory=dict)
    style_resolved_json: dict[str, Any] = Field(default_factory=dict)
    selected_candidate_id: UUID | None = None
    effect_settings_json: dict[str, Any] = Field(default_factory=dict)
    cover_placement_json: dict[str, Any] = Field(default_factory=dict)
    current_step: WorkflowStep = "genre"
    workflow_state_json: dict[str, Any] = Field(default_factory=dict)
    save_revision: int = 0
    last_saved_at: datetime | None = None
    created_at: datetime | None = None


JobType = Literal[
    "cover_analysis",
    "layout_generation",
    "style_resolution",
    "typography_generation",
    "export",
    "asset_cleanup",
]


class JobCreate(BaseModel):
    project_id: UUID
    version_id: UUID
    type: JobType
    input_json: dict[str, Any] = Field(default_factory=dict)


class JobResponse(BaseModel):
    id: UUID
    project_id: UUID
    version_id: UUID
    type: JobType
    status: str
    result_json: dict[str, Any] = Field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None


class MeResponse(BaseModel):
    id: UUID
    email: str
    display_name: str | None = None


class CreditSummaryResponse(BaseModel):
    free_generation_remaining: int
    free_generation_limit: int
    free_generation_used_today: int
    paid_credit_balance: float
    usage_date: str


class CreditLedgerItem(BaseModel):
    id: UUID
    credit_type: str
    type: str
    amount: float
    balance_after: float
    reason: str | None = None
    memo: str | None = None
    created_at: datetime | None = None


class StoragePolicyResponse(BaseModel):
    cover_retention_hours: int = 24
    completed_asset_retention_days: int = 30
    failed_temp_retention_days: int = 7
    signed_url_expiration_seconds: int = 3600


class LicenseSummaryResponse(BaseModel):
    free_license: str
    paid_license: str


class DeleteRequestCreate(BaseModel):
    request_message: str | None = Field(default=None, max_length=500)


class DeleteRequestResponse(BaseModel):
    id: UUID
    status: str
    created_at: datetime | None = None


ExportType = Literal["final_png", "transparent_png", "layer_zip", "watermark_removed_png"]


class ExportClaimCreate(BaseModel):
    project_id: UUID
    version_id: UUID
    export_type: ExportType
    credit_source: Literal["free", "paid"] = "free"
    paid_credit_cost: float = Field(default=0, ge=0, le=100)


class ExportClaimResponse(BaseModel):
    id: UUID
    export_type: ExportType
    credit_source: str
    paid_credit_spent: float
    license_type: str
    watermark_applied: bool
    status: str


class SignedUrlResponse(BaseModel):
    asset_id: UUID
    url: str
    expires_in: int


AssetType = Literal[
    "cover",
    "layout_png",
    "candidate",
    "transparent_bw",
    "final_export",
    "advanced_png",
    "layer_zip",
]


class SignedUploadCreate(BaseModel):
    project_id: UUID
    version_id: UUID | None = None
    type: AssetType = "cover"
    filename: str = Field(min_length=1, max_length=180)
    mime_type: str = Field(min_length=1, max_length=120)
    size_bytes: int | None = Field(default=None, ge=0)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    storage_bucket: str | None = Field(default=None, min_length=1, max_length=120)


class SignedUploadResponse(BaseModel):
    asset_id: UUID
    storage_bucket: str
    storage_path: str
    url: str
    expires_in: int
