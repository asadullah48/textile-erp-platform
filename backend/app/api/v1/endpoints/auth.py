from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, get_admin_db
from app.core.dependencies import get_current_user_id, get_current_tenant_id
from app.schemas.auth import RegisterTenantRequest, LoginRequest, RegisterTenantResponse
from app.services import tenant_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register-tenant", response_model=RegisterTenantResponse)
async def register_tenant(payload: RegisterTenantRequest, db: AsyncSession = Depends(get_admin_db)):
    return await tenant_service.register_tenant(db, payload)


@router.post("/login", response_model=RegisterTenantResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_admin_db)):
    return await tenant_service.login(db, payload)


@router.get("/me")
async def me(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    tenant_id: str = Depends(get_current_tenant_id),
):
    return await tenant_service.get_me(db, user_id, tenant_id)
