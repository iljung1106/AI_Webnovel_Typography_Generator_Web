from __future__ import annotations

from fastapi import HTTPException, status

from .supabase_client import SupabaseConfigError, SupabaseRequestError


def supabase_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, SupabaseConfigError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    if isinstance(exc, SupabaseRequestError):
        status_code = exc.status_code
        if status_code >= 500:
            status_code = status.HTTP_502_BAD_GATEWAY
        return HTTPException(status_code=status_code, detail=exc.message)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected Supabase error.",
    )
