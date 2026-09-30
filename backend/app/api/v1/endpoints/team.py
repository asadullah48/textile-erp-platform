"""Team membership within the caller's tenant (RLS-scoped)."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id, require_permission
from app.schemas.auth import TeamMemberCreate, TeamMemberOut
from app.services import tenant_service

router = APIRouter(prefix="/team", tags=["team"])


@router.get("/members", response_model=list[TeamMemberOut], dependencies=[require_permission("team_view")])
async def list_members(db: AsyncSession = Depends(get_db)):
    return await tenant_service.list_members(db)


@router.post("/members", response_model=TeamMemberOut, status_code=201,
             dependencies=[require_permission("user_manage")])
async def add_member(
    payload: TeamMemberCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id),
):
    return await tenant_service.add_member(db, tenant_id, payload)
