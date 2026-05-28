from __future__ import annotations

from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status

from ..db_helpers import get_owned_project, get_project_version
from ..errors import supabase_http_error
from ..schemas import ExportClaimCreate, ExportClaimResponse, UserContext
from ..security import get_current_user
from ..supabase_client import SupabaseConfigError, SupabaseRequestError, supabase

router = APIRouter()


@router.post("/claim", response_model=ExportClaimResponse, status_code=status.HTTP_201_CREATED)
async def claim_export(
    payload: ExportClaimCreate,
    user: UserContext = Depends(get_current_user),
) -> ExportClaimResponse:
    try:
        get_owned_project(payload.project_id, user.user_id)
        get_project_version(payload.project_id, payload.version_id)
        credit_source = _required_credit_source(payload)
        paid_cost = _required_paid_cost(payload, credit_source)
        if paid_cost > 0:
            _spend_paid_credit(
                user_id=user.user_id,
                amount=paid_cost,
                project_id=payload.project_id,
                reason="export_charge",
                memo=_export_memo(payload.export_type),
            )
        rows = supabase.insert(
            "export_requests",
            {
                "user_id": str(user.user_id),
                "project_id": str(payload.project_id),
                "version_id": str(payload.version_id),
                "export_type": payload.export_type,
                "status": "succeeded",
                "credit_source": credit_source,
                "paid_credit_spent": paid_cost,
                "license_type": "paid_commercial" if credit_source == "paid" else "free_attribution_required",
                "watermark_applied": credit_source != "paid",
                "completed_at": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
            },
        )
    except HTTPException:
        raise
    except (SupabaseConfigError, SupabaseRequestError) as exc:
        raise supabase_http_error(exc) from exc
    if not rows:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Export request was not created.")
    return ExportClaimResponse(**rows[0])


def _required_credit_source(payload: ExportClaimCreate) -> str:
    if payload.export_type == "layer_zip":
        return "paid"
    return payload.credit_source


def _required_paid_cost(payload: ExportClaimCreate, credit_source: str) -> float:
    if payload.export_type == "layer_zip":
        return max(payload.paid_credit_cost, 1)
    if credit_source == "paid":
        return payload.paid_credit_cost
    return 0


def _spend_paid_credit(
    *,
    user_id: UUID,
    amount: float,
    project_id: UUID,
    reason: str,
    memo: str,
) -> None:
    balance = _paid_credit_balance(user_id)
    if balance < amount:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="유료 크레딧이 부족해요.")
    balance_after = balance - amount
    supabase.insert(
        "credit_ledger",
        {
            "user_id": str(user_id),
            "credit_type": "paid_credit",
            "type": "export_charge",
            "amount": -amount,
            "balance_after": balance_after,
            "related_project_id": str(project_id),
            "reason": reason,
            "memo": memo,
        },
    )


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


def _export_memo(export_type: str) -> str:
    if export_type == "layer_zip":
        return "레이어 ZIP 내보내기"
    if export_type == "watermark_removed_png":
        return "워터마크 없는 PNG 내보내기"
    return "PNG 내보내기"
