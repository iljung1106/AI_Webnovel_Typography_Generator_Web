from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..errors import supabase_http_error
from ..schemas import (
    CreditLedgerItem,
    CreditSummaryResponse,
    DeleteRequestCreate,
    DeleteRequestResponse,
    LicenseSummaryResponse,
    MeResponse,
    StoragePolicyResponse,
    UserContext,
)
from ..security import get_current_user
from ..supabase_client import SupabaseConfigError, SupabaseRequestError, supabase

router = APIRouter()

FREE_GENERATION_DAILY_LIMIT = 3


@router.get("", response_model=MeResponse)
async def get_me(user: UserContext = Depends(get_current_user)) -> MeResponse:
    try:
        rows = supabase.select(
            "profiles",
            {
                "select": "id,email,display_name",
                "id": f"eq.{user.user_id}",
                "limit": "1",
            },
        )
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    if not rows:
        return MeResponse(id=user.user_id, email=user.email or "", display_name=None)
    return MeResponse(**rows[0])


@router.get("/credits", response_model=CreditSummaryResponse)
async def get_credit_summary(user: UserContext = Depends(get_current_user)) -> CreditSummaryResponse:
    usage_date = _today_key()
    try:
        usage_rows = supabase.select(
            "daily_free_credit_usage",
            {
                "select": "generation_batches_used",
                "user_id": f"eq.{user.user_id}",
                "usage_date": f"eq.{usage_date}",
                "limit": "1",
            },
        )
        ledger_rows = supabase.select(
            "credit_ledger",
            {
                "select": "amount",
                "user_id": f"eq.{user.user_id}",
                "credit_type": "eq.paid_credit",
            },
        )
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    used = int(usage_rows[0]["generation_batches_used"]) if usage_rows else 0
    paid_balance = sum(float(row.get("amount") or 0) for row in ledger_rows)
    return CreditSummaryResponse(
        free_generation_remaining=max(FREE_GENERATION_DAILY_LIMIT - used, 0),
        free_generation_limit=FREE_GENERATION_DAILY_LIMIT,
        free_generation_used_today=used,
        paid_credit_balance=paid_balance,
        usage_date=usage_date,
    )


@router.get("/credit-ledger", response_model=list[CreditLedgerItem])
async def list_credit_ledger(
    limit: int = Query(default=20, ge=1, le=100),
    user: UserContext = Depends(get_current_user),
) -> list[CreditLedgerItem]:
    try:
        rows = supabase.select(
            "credit_ledger",
            {
                "select": "id,credit_type,type,amount,balance_after,reason,memo,created_at",
                "user_id": f"eq.{user.user_id}",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    return [CreditLedgerItem(**row) for row in rows]


@router.get("/storage-policy", response_model=StoragePolicyResponse)
async def get_storage_policy(_user: UserContext = Depends(get_current_user)) -> StoragePolicyResponse:
    return StoragePolicyResponse()


@router.get("/license-summary", response_model=LicenseSummaryResponse)
async def get_license_summary(_user: UserContext = Depends(get_current_user)) -> LicenseSummaryResponse:
    return LicenseSummaryResponse(
        free_license="무료 생성 결과물은 작품 상세 페이지 또는 소개 영역에 fontasy.ai.kr 표시가 필요합니다.",
        paid_license="유료 크레딧으로 만든 결과물은 표시 의무 없이 사용할 수 있습니다.",
    )


@router.post("/delete-request", response_model=DeleteRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_delete_request(
    payload: DeleteRequestCreate,
    user: UserContext = Depends(get_current_user),
) -> DeleteRequestResponse:
    try:
        open_rows = supabase.select(
            "user_delete_requests",
            {
                "select": "id,status,created_at",
                "user_id": f"eq.{user.user_id}",
                "status": "eq.requested",
                "limit": "1",
            },
        )
        if open_rows:
            return DeleteRequestResponse(**open_rows[0])
        rows = supabase.insert(
            "user_delete_requests",
            {
                "user_id": str(user.user_id),
                "request_message": payload.request_message,
            },
        )
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    if not rows:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Delete request was not created.")
    return DeleteRequestResponse(**rows[0])


def _today_key() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
