"""Router for /fabric-lots CRUD."""
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id
from app.schemas.fabric import FabricLotCreate, FabricLotRead, FabricLotUpdate
from app.services import fabric_service

router = APIRouter(prefix="/fabric-lots", tags=["fabric-lots"])


@router.get("", response_model=list[FabricLotRead])
async def list_lots(db: AsyncSession = Depends(get_db), _: str = Depends(get_current_tenant_id)):
    return await fabric_service.list_lots(db)


@router.post("", response_model=FabricLotRead, status_code=201)
async def create_lot(
    payload: FabricLotCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: str = Depends(get_current_tenant_id),
):
    return await fabric_service.create_lot(db, tenant_id, payload)


@router.get("/{lot_id}", response_model=FabricLotRead)
async def get_lot(lot_id: UUID, db: AsyncSession = Depends(get_db), _: str = Depends(get_current_tenant_id)):
    return await fabric_service.get_lot(db, str(lot_id))


@router.patch("/{lot_id}", response_model=FabricLotRead)
async def update_lot(
    lot_id: UUID,
    payload: FabricLotUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_tenant_id),
):
    return await fabric_service.update_lot(db, str(lot_id), payload)


@router.delete("/{lot_id}", status_code=204)
async def delete_lot(lot_id: UUID, db: AsyncSession = Depends(get_db), _: str = Depends(get_current_tenant_id)):
    await fabric_service.delete_lot(db, str(lot_id))
