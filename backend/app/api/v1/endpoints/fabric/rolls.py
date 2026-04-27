"""Router for /fabric-rolls standalone CRUD."""
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id
from app.schemas.fabric import FabricRollRead, FabricRollUpdate
from app.services import fabric_service

router = APIRouter(prefix="/fabric-rolls", tags=["fabric-rolls"])


@router.get("", response_model=list[FabricRollRead])
async def list_rolls(db: AsyncSession = Depends(get_db), _: str = Depends(get_current_tenant_id)):
    return await fabric_service.list_rolls(db)


@router.get("/{roll_id}", response_model=FabricRollRead)
async def get_roll(roll_id: UUID, db: AsyncSession = Depends(get_db), _: str = Depends(get_current_tenant_id)):
    return await fabric_service.get_roll(db, str(roll_id))


@router.patch("/{roll_id}", response_model=FabricRollRead)
async def update_roll(
    roll_id: UUID,
    payload: FabricRollUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_tenant_id),
):
    return await fabric_service.update_roll(db, str(roll_id), payload)


@router.delete("/{roll_id}", status_code=204)
async def delete_roll(roll_id: UUID, db: AsyncSession = Depends(get_db), _: str = Depends(get_current_tenant_id)):
    await fabric_service.delete_roll(db, str(roll_id))
