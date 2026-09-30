from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, get_admin_db
from app.core.dependencies import get_current_user_id, get_current_tenant_id
from app.schemas.auth import LoginRequest, MeResponse, RegisterTenantRequest, RegisterTenantResponse
from app.services import tenant_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register-tenant", response_model=RegisterTenantResponse)
async def register_tenant(payload: RegisterTenantRequest, db: AsyncSession = Depends(get_admin_db)):
    return await tenant_service.register_tenant(db, payload)


@router.post("/login", response_model=RegisterTenantResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_admin_db)):
    return await tenant_service.login(db, payload)


@router.post("/demo", response_model=RegisterTenantResponse, status_code=201)
async def demo_workspace(db: AsyncSession = Depends(get_admin_db)):
    """Create a private, pre-seeded demo mill for one visitor (expires after 24h)."""
    if not settings.DEMO_ENABLED:
        raise HTTPException(404, "Demo workspaces are disabled")
    return await tenant_service.create_demo_workspace(db, settings.DEMO_MAX_LIVE)


@router.get("/me", response_model=MeResponse)
async def me(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    tenant_id: str = Depends(get_current_tenant_id),
):
    return await tenant_service.get_me(db, user_id, tenant_id)
