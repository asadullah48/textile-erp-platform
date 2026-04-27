"""CRUD service for FabricLot and FabricRoll, tenant-scoped via RLS."""
from uuid import UUID
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models.fabric import FabricLot, FabricRoll
from app.schemas.fabric import (
    FabricLotCreate, FabricLotUpdate,
    FabricRollCreate, FabricRollUpdate,
    LotSummary,
)


async def list_lots(db: AsyncSession) -> list[FabricLot]:
    result = await db.execute(
        select(FabricLot).where(FabricLot.is_deleted == False).order_by(FabricLot.created_at.desc())
    )
    return result.scalars().all()


async def create_lot(db: AsyncSession, tenant_id: str, payload: FabricLotCreate) -> FabricLot:
    lot = FabricLot(tenant_id=UUID(tenant_id), **payload.model_dump())
    db.add(lot)
    await db.flush()
    await db.refresh(lot)
    return lot


async def get_lot(db: AsyncSession, lot_id: str) -> FabricLot:
    result = await db.execute(
        select(FabricLot).where(FabricLot.id == UUID(lot_id), FabricLot.is_deleted == False)
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(404, "Fabric lot not found")
    return lot


async def update_lot(db: AsyncSession, lot_id: str, payload: FabricLotUpdate) -> FabricLot:
    lot = await get_lot(db, lot_id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(lot, field, value)
    await db.flush()
    await db.refresh(lot)
    return lot


async def delete_lot(db: AsyncSession, lot_id: str) -> None:
    lot = await get_lot(db, lot_id)
    lot.is_deleted = True
    lot.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def list_rolls(db: AsyncSession, lot_id: str | None = None) -> list[FabricRoll]:
    if lot_id:
        await get_lot(db, lot_id)  # raises 404 if not found / not owned
    q = select(FabricRoll).where(FabricRoll.is_deleted == False)
    if lot_id:
        q = q.where(FabricRoll.lot_id == UUID(lot_id))
    result = await db.execute(q.order_by(FabricRoll.created_at.desc()))
    return result.scalars().all()


async def create_roll(db: AsyncSession, tenant_id: str, lot_id: str, payload: FabricRollCreate) -> FabricRoll:
    await get_lot(db, lot_id)  # raises 404 if lot is soft-deleted or not owned
    roll = FabricRoll(tenant_id=UUID(tenant_id), lot_id=UUID(lot_id), **payload.model_dump())
    db.add(roll)
    await db.flush()
    await db.refresh(roll)
    return roll


async def get_roll(db: AsyncSession, roll_id: str) -> FabricRoll:
    result = await db.execute(
        select(FabricRoll).where(FabricRoll.id == UUID(roll_id), FabricRoll.is_deleted == False)
    )
    roll = result.scalar_one_or_none()
    if not roll:
        raise HTTPException(404, "Fabric roll not found")
    return roll


async def update_roll(db: AsyncSession, roll_id: str, payload: FabricRollUpdate) -> FabricRoll:
    roll = await get_roll(db, roll_id)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(roll, field, value)
    await db.flush()
    await db.refresh(roll)
    return roll


async def delete_roll(db: AsyncSession, roll_id: str) -> None:
    roll = await get_roll(db, roll_id)
    roll.is_deleted = True
    roll.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def get_lot_summary(db: AsyncSession, lot_id: str) -> LotSummary:
    await get_lot(db, lot_id)  # verify existence + RLS
    result = await db.execute(
        select(
            func.count(FabricRoll.id).label("roll_count"),
            func.coalesce(func.sum(FabricRoll.length_meters), 0).label("total_meters"),
            func.coalesce(
                func.sum(FabricRoll.length_meters).filter(FabricRoll.status == "available"), 0
            ).label("meters_available"),
            func.coalesce(
                func.sum(FabricRoll.length_meters).filter(FabricRoll.status == "reserved"), 0
            ).label("meters_reserved"),
            func.coalesce(
                func.sum(FabricRoll.length_meters).filter(FabricRoll.status == "consumed"), 0
            ).label("meters_consumed"),
        ).where(FabricRoll.lot_id == UUID(lot_id), FabricRoll.is_deleted == False)
    )
    row = result.one()
    return LotSummary(
        lot_id=UUID(lot_id),
        roll_count=row.roll_count,
        total_meters=Decimal(str(row.total_meters)),
        meters_available=Decimal(str(row.meters_available)),
        meters_reserved=Decimal(str(row.meters_reserved)),
        meters_consumed=Decimal(str(row.meters_consumed)),
    )
