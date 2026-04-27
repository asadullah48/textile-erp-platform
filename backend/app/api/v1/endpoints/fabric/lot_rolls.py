"""Nested router: /fabric-lots/{lot_id}/rolls."""
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id
from app.schemas.fabric import FabricRollCreate, FabricRollRead
from app.services import fabric_service

router = APIRouter(tags=["fabric-lots"])


@router.get("/fabric-lots/{lot_id}/rolls", response_model=list[FabricRollRead])
async def list_rolls_for_lot(
    lot_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_tenant_id),
):
    return await fabric_service.list_rolls(db, lot_id=str(lot_id))


@router.post("/fabric-lots/{lot_id}/rolls", response_model=FabricRollRead, status_code=201)
async def add_roll_to_lot(
    lot_id: UUID,
    payload: FabricRollCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id),
):
    return await fabric_service.create_roll(db, tenant_id, str(lot_id), payload)
