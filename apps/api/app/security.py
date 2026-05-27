from __future__ import annotations

from uuid import UUID

from fastapi import Header, HTTPException, status

from .schemas import UserContext
from .settings import settings
from .supabase_client import SupabaseConfigError, SupabaseRequestError, supabase


async def get_current_user(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> UserContext:
    """Supabase Auth boundary for API routes.

    Production requests must send ``Authorization: Bearer <supabase-access-token>``.
    ``X-User-Id`` remains available only when ALLOW_DEV_AUTH is true and should
    point at an existing Supabase Auth/profile user when DB-backed routes are used.
    """
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization must be a Bearer token.",
            )
        try:
            auth_user = supabase.get_auth_user(token)
            return UserContext(user_id=UUID(auth_user["id"]))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Supabase access token did not contain a UUID user id.",
            ) from exc
        except SupabaseConfigError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(exc),
            ) from exc
        except SupabaseRequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=exc.message,
            ) from exc

    if not settings.allow_dev_auth:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Supabase Bearer token.",
        )
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Supabase Bearer token or X-User-Id development header.",
        )
    try:
        return UserContext(user_id=UUID(x_user_id))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-User-Id must be a UUID.",
        ) from exc
