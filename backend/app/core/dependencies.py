from fastapi import Depends, HTTPException, Request
from app.core.permissions import PERMISSIONS
from app.core.security import decode_jwt


def _ensure_state_from_token(request: Request) -> None:
    """Populate request.state from the JWT if the tenancy middleware was bypassed."""
    if getattr(request.state, "user_id", None) is None:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing auth token")
        payload = decode_jwt(auth_header.removeprefix("Bearer "))
        request.state.user_id = payload.get("sub")
        request.state.tenant_id = payload.get("tenant_id")
        request.state.role = payload.get("role")


def require_permission(feature: str):
    def dependency(request: Request):
        role = getattr(request.state, "role", None)
        if not PERMISSIONS.get(feature, {}).get(role, False):
            raise HTTPException(403, f"Role '{role}' lacks permission '{feature}'")
    return Depends(dependency)


def get_current_tenant_id(request: Request) -> str:
    _ensure_state_from_token(request)
    return request.state.tenant_id


def get_current_user_id(request: Request) -> str:
    _ensure_state_from_token(request)
    return request.state.user_id


def get_current_role(request: Request) -> str:
    _ensure_state_from_token(request)
    return request.state.role
