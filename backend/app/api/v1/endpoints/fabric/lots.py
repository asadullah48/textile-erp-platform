"""/fabric-lots — lots, their rolls and summary."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id, require_permission
from app.schemas.fabric import (
    FabricCategory, FabricLotCreate, FabricLotRead, FabricLotUpdate, FabricRollBulkCreate,
    FabricRollCreate, FabricRollRead, LotStatus, LotSummary,
)
from app.services import fabric_service as svc

router = APIRouter(prefix="/fabric-lots", tags=["fabric-lots"])
READ = [require_permission("fabric_read")]
WRITE = [require_permission("fabric_write")]


@router.get("", response_model=list[FabricLotRead], dependencies=READ)
async def list_lots(
    status: Optional[LotStatus] = None,
    fabric_category: Optional[FabricCategory] = None,
    supplier_id: Optional[UUID] = None,
    search: Optional[str] = Query(default=None, max_length=100),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_lots(db, status=status, fabric_category=fabric_category, supplier_id=supplier_id,
                               search=search, limit=limit, offset=offset)


@router.post("", response_model=FabricLotRead, status_code=201, dependencies=WRITE)
async def create_lot(payload: FabricLotCreate, db: AsyncSession = Depends(get_db),
                     tenant_id: str = Depends(get_current_tenant_id)):
    return await svc.create_lot(db, tenant_id, payload)


@router.get("/{lot_id}", response_model=FabricLotRead, dependencies=READ)
async def get_lot(lot_id: UUID, db: AsyncSession = Depends(get_db)):
    return await svc.get_lot(db, lot_id)


@router.patch("/{lot_id}", response_model=FabricLotRead, dependencies=WRITE)
async def update_lot(lot_id: UUID, payload: FabricLotUpdate, db: AsyncSession = Depends(get_db)):
    return await svc.update_lot(db, lot_id, payload)


@router.delete("/{lot_id}", status_code=204, dependencies=[require_permission("fabric_delete")])
async def delete_lot(lot_id: UUID, db: AsyncSession = Depends(get_db)):
    await svc.delete_lot(db, lot_id)


@router.get("/{lot_id}/summary", response_model=LotSummary, dependencies=READ)
async def lot_summary(lot_id: UUID, db: AsyncSession = Depends(get_db)):
    return await svc.get_lot_summary(db, lot_id)


@router.get("/{lot_id}/rolls", response_model=list[FabricRollRead], dependencies=READ)
async def list_rolls_for_lot(lot_id: UUID, db: AsyncSession = Depends(get_db)):
    return await svc.list_rolls(db, lot_id=lot_id, limit=500)


@router.post("/{lot_id}/rolls", response_model=FabricRollRead, status_code=201, dependencies=WRITE)
async def add_roll_to_lot(lot_id: UUID, payload: FabricRollCreate, db: AsyncSession = Depends(get_db),
                          tenant_id: str = Depends(get_current_tenant_id)):
    return await svc.create_roll(db, tenant_id, lot_id, payload)


@router.post("/{lot_id}/rolls/bulk", response_model=list[FabricRollRead], status_code=201, dependencies=WRITE)
async def bulk_add_rolls(lot_id: UUID, payload: FabricRollBulkCreate, db: AsyncSession = Depends(get_db),
                         tenant_id: str = Depends(get_current_tenant_id)):
    return await svc.bulk_create_rolls(db, tenant_id, lot_id, payload)
