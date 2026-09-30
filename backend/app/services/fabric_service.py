"""Fabric Mill core services: suppliers, lots, rolls and roll issuance.

All reads/writes run inside a request transaction whose RLS context is already
scoped to the caller's tenant (see core/database.get_db), so no query here
filters on tenant_id — the database does it. `tenant_id` is only passed in to
stamp new rows, and RLS WITH CHECK rejects any mismatch.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional, TypeVar
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import TenantBaseModel
from app.models.fabric import (
    FabricImport, FabricIssuance, FabricLot, FabricRoll, FabricSupplier, YarnType,
)
from app.schemas.fabric import (
    FabricLotCreate, FabricLotUpdate, FabricRollBulkCreate, FabricRollCreate, FabricRollUpdate,
    IssueRollRequest, LotSummary, SupplierCreate, SupplierStats, SupplierUpdate,
)

M = TypeVar("M", bound=TenantBaseModel)
ZERO = Decimal("0")
MAX_PAGE = 500


# --------------------------------------------------------------------------- helpers

def page(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, MAX_PAGE)), max(0, offset)


async def get_or_404(db: AsyncSession, model: type[M], obj_id: UUID | str, label: str,
                     *, for_update: bool = False) -> M:
    q = select(model).where(model.id == UUID(str(obj_id)), model.is_deleted == False)  # noqa: E712
    if for_update:
        q = q.with_for_update()
    obj = (await db.execute(q)).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, f"{label} not found")
    return obj


async def soft_delete(db: AsyncSession, obj: TenantBaseModel) -> None:
    obj.is_deleted = True
    obj.deleted_at = datetime.now(timezone.utc)
    await db.flush()


def apply_patch(obj, payload) -> None:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)


async def _ensure_supplier(db: AsyncSession, supplier_id: Optional[UUID]) -> None:
    if supplier_id is not None:
        await get_or_404(db, FabricSupplier, supplier_id, "Supplier")


# --------------------------------------------------------------------------- suppliers

async def list_suppliers(db: AsyncSession, search: Optional[str], limit: int, offset: int):
    limit, offset = page(limit, offset)
    q = select(FabricSupplier).where(FabricSupplier.is_deleted == False)  # noqa: E712
    if search:
        like = f"%{search.strip()}%"
        q = q.where(FabricSupplier.name.ilike(like) | FabricSupplier.city.ilike(like))
    q = q.order_by(FabricSupplier.name).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


async def create_supplier(db: AsyncSession, tenant_id: str, payload: SupplierCreate) -> FabricSupplier:
    supplier = FabricSupplier(tenant_id=UUID(tenant_id), **payload.model_dump())
    db.add(supplier)
    await db.flush()
    await db.refresh(supplier)
    return supplier


async def supplier_detail(db: AsyncSession, supplier_id: UUID) -> dict:
    s = await get_or_404(db, FabricSupplier, supplier_id, "Supplier")
    lot_row = (await db.execute(
        select(
            func.count(FabricLot.id),
            func.coalesce(func.sum(FabricLot.total_meters), 0),
            func.coalesce(func.sum(FabricLot.total_meters * FabricLot.cost_per_meter), 0),
        ).where(FabricLot.supplier_id == s.id, FabricLot.is_deleted == False)  # noqa: E712
    )).one()
    open_imports = (await db.execute(
        select(func.count(FabricImport.id)).where(
            FabricImport.supplier_id == s.id,
            FabricImport.is_deleted == False,  # noqa: E712
            FabricImport.status.in_(["in_transit", "cleared"]),
        )
    )).scalar_one()
    yarn_types = (await db.execute(
        select(func.count(YarnType.id)).where(YarnType.supplier_id == s.id, YarnType.is_deleted == False)  # noqa: E712
    )).scalar_one()
    data = {k: getattr(s, k) for k in (
        "id", "tenant_id", "created_at", "updated_at", "name", "contact_person", "phone",
        "email", "address", "city", "country", "payment_terms", "notes")}
    data["stats"] = SupplierStats(
        lots_received=lot_row[0],
        meters_received=Decimal(lot_row[1]),
        purchase_value_pkr=Decimal(lot_row[2]).quantize(Decimal("0.01")),
        open_imports=open_imports,
        yarn_types_supplied=yarn_types,
    )
    return data


async def update_supplier(db: AsyncSession, supplier_id: UUID, payload: SupplierUpdate) -> FabricSupplier:
    s = await get_or_404(db, FabricSupplier, supplier_id, "Supplier")
    apply_patch(s, payload)
    await db.flush()
    await db.refresh(s)
    return s


async def delete_supplier(db: AsyncSession, supplier_id: UUID) -> None:
    s = await get_or_404(db, FabricSupplier, supplier_id, "Supplier")
    in_use = (await db.execute(
        select(func.count(FabricLot.id)).where(FabricLot.supplier_id == s.id, FabricLot.is_deleted == False)  # noqa: E712
    )).scalar_one()
    if in_use:
        raise HTTPException(409, f"Supplier is referenced by {in_use} active lot(s)")
    await soft_delete(db, s)


# --------------------------------------------------------------------------- lots

async def _ensure_unique_lot_number(db: AsyncSession, lot_number: str, exclude: Optional[UUID] = None):
    q = select(FabricLot.id).where(FabricLot.lot_number == lot_number, FabricLot.is_deleted == False)  # noqa: E712
    if exclude:
        q = q.where(FabricLot.id != exclude)
    if (await db.execute(q)).first():
        raise HTTPException(409, f"Lot number '{lot_number}' already exists")


async def list_lots(db: AsyncSession, *, status: Optional[str] = None, fabric_category: Optional[str] = None,
                    supplier_id: Optional[UUID] = None, search: Optional[str] = None,
                    limit: int = 200, offset: int = 0):
    limit, offset = page(limit, offset)
    q = select(FabricLot).where(FabricLot.is_deleted == False)  # noqa: E712
    if status:
        q = q.where(FabricLot.status == status)
    if fabric_category:
        q = q.where(FabricLot.fabric_category == fabric_category)
    if supplier_id:
        q = q.where(FabricLot.supplier_id == supplier_id)
    if search:
        like = f"%{search.strip()}%"
        q = q.where(FabricLot.lot_number.ilike(like) | FabricLot.fabric_type.ilike(like) | FabricLot.color.ilike(like))
    q = q.order_by(FabricLot.received_date.desc(), FabricLot.created_at.desc()).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


async def create_lot(db: AsyncSession, tenant_id: str, payload: FabricLotCreate) -> FabricLot:
    await _ensure_unique_lot_number(db, payload.lot_number)
    await _ensure_supplier(db, payload.supplier_id)
    data = payload.model_dump()
    if payload.supplier_id and not payload.supplier:
        data["supplier"] = (await get_or_404(db, FabricSupplier, payload.supplier_id, "Supplier")).name
    lot = FabricLot(tenant_id=UUID(tenant_id), **data)
    db.add(lot)
    await db.flush()
    await db.refresh(lot)
    return lot


async def get_lot(db: AsyncSession, lot_id: UUID | str) -> FabricLot:
    return await get_or_404(db, FabricLot, lot_id, "Fabric lot")


async def update_lot(db: AsyncSession, lot_id: UUID | str, payload: FabricLotUpdate) -> FabricLot:
    lot = await get_lot(db, lot_id)
    if payload.lot_number and payload.lot_number != lot.lot_number:
        await _ensure_unique_lot_number(db, payload.lot_number, exclude=lot.id)
    if "supplier_id" in payload.model_fields_set:
        await _ensure_supplier(db, payload.supplier_id)
    apply_patch(lot, payload)
    await db.flush()
    await db.refresh(lot)
    return lot


async def delete_lot(db: AsyncSession, lot_id: UUID | str) -> None:
    lot = await get_lot(db, lot_id)
    issued = (await db.execute(
        select(func.count(FabricRoll.id)).where(
            FabricRoll.lot_id == lot.id, FabricRoll.is_deleted == False, FabricRoll.issued_meters > 0)  # noqa: E712
    )).scalar_one()
    if issued:
        raise HTTPException(409, "Lot has issued rolls; it is part of the production record and cannot be deleted")
    await soft_delete(db, lot)


async def refresh_lot_status(db: AsyncSession, lot: FabricLot) -> None:
    """Derive lot status from its rolls. Never moves a lot backwards to 'pending'."""
    row = (await db.execute(
        select(
            func.count(FabricRoll.id),
            func.coalesce(func.sum(FabricRoll.length_meters), 0),
            func.coalesce(func.sum(FabricRoll.issued_meters), 0),
        ).where(FabricRoll.lot_id == lot.id, FabricRoll.is_deleted == False)  # noqa: E712
    )).one()
    count, length, issued = row[0], Decimal(row[1]), Decimal(row[2])
    if count == 0:
        return
    if issued <= 0:
        new = "in_stock"
    elif issued >= length:
        new = "fully_consumed"
    else:
        new = "partially_consumed"
    lot.status = new
    await db.flush()


# --------------------------------------------------------------------------- rolls

async def _ensure_unique_roll_numbers(db: AsyncSession, numbers: list[str]) -> None:
    clash = (await db.execute(
        select(FabricRoll.roll_number).where(
            FabricRoll.roll_number.in_(numbers), FabricRoll.is_deleted == False)  # noqa: E712
    )).scalars().first()
    if clash:
        raise HTTPException(409, f"Roll number '{clash}' already exists")


async def list_rolls(db: AsyncSession, lot_id: UUID | str | None = None, *, status: Optional[str] = None,
                     search: Optional[str] = None, limit: int = 200, offset: int = 0):
    limit, offset = page(limit, offset)
    if lot_id:
        await get_lot(db, lot_id)
    q = select(FabricRoll).where(FabricRoll.is_deleted == False)  # noqa: E712
    if lot_id:
        q = q.where(FabricRoll.lot_id == UUID(str(lot_id)))
    if status:
        q = q.where(FabricRoll.status == status)
    if search:
        q = q.where(FabricRoll.roll_number.ilike(f"%{search.strip()}%"))
    q = q.order_by(FabricRoll.roll_number).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


async def create_roll(db: AsyncSession, tenant_id: str, lot_id: UUID | str, payload: FabricRollCreate) -> FabricRoll:
    lot = await get_lot(db, lot_id)
    await _ensure_unique_roll_numbers(db, [payload.roll_number])
    roll = FabricRoll(tenant_id=UUID(tenant_id), lot_id=lot.id, **payload.model_dump())
    db.add(roll)
    await db.flush()
    if lot.status == "pending":
        await refresh_lot_status(db, lot)
    await db.refresh(roll)
    return roll


async def bulk_create_rolls(db: AsyncSession, tenant_id: str, lot_id: UUID | str,
                            payload: FabricRollBulkCreate) -> list[FabricRoll]:
    lot = await get_lot(db, lot_id)
    width = max(3, len(str(payload.start + payload.count - 1)))
    numbers = [f"{payload.prefix}{str(payload.start + i).zfill(width)}" for i in range(payload.count)]
    await _ensure_unique_roll_numbers(db, numbers)
    rolls = [
        FabricRoll(
            tenant_id=UUID(tenant_id), lot_id=lot.id, roll_number=n,
            length_meters=payload.length_meters, weight_kg=payload.weight_kg,
            grade=payload.grade, location=payload.location, status="available",
        )
        for n in numbers
    ]
    db.add_all(rolls)
    await db.flush()
    if lot.status == "pending":
        await refresh_lot_status(db, lot)
    for r in rolls:
        await db.refresh(r)
    return rolls


async def get_roll(db: AsyncSession, roll_id: UUID | str, *, for_update: bool = False) -> FabricRoll:
    return await get_or_404(db, FabricRoll, roll_id, "Fabric roll", for_update=for_update)


async def update_roll(db: AsyncSession, roll_id: UUID | str, payload: FabricRollUpdate) -> FabricRoll:
    roll = await get_roll(db, roll_id)
    if roll.status in ("issued", "consumed") and payload.status:
        raise HTTPException(409, f"Roll is {roll.status}; its status is driven by issuances")
    if payload.length_meters is not None and payload.length_meters < roll.issued_meters:
        raise HTTPException(409, "Length cannot be less than meters already issued")
    if payload.roll_number and payload.roll_number != roll.roll_number:
        await _ensure_unique_roll_numbers(db, [payload.roll_number])
    apply_patch(roll, payload)
    await db.flush()
    await db.refresh(roll)
    return roll


async def delete_roll(db: AsyncSession, roll_id: UUID | str) -> None:
    roll = await get_roll(db, roll_id)
    if roll.issued_meters > 0:
        raise HTTPException(409, "Roll has issuances and cannot be deleted")
    await soft_delete(db, roll)


async def issue_roll(db: AsyncSession, tenant_id: str, user_id: str, roll_id: UUID,
                     payload: IssueRollRequest) -> FabricIssuance:
    """Issue all or part of a roll. The roll row is locked (SELECT … FOR UPDATE)
    so two supervisors issuing the same roll at once cannot over-issue it."""
    roll = await get_roll(db, roll_id, for_update=True)
    remaining = Decimal(roll.length_meters) - Decimal(roll.issued_meters)
    if roll.status == "reserved" and not payload.cmt_order_reference:
        raise HTTPException(409, "Roll is reserved — issue it against a CMT order reference")
    if remaining <= 0:
        raise HTTPException(409, "Roll has no remaining meters")
    meters = payload.issued_meters if payload.issued_meters is not None else remaining
    if meters > remaining:
        raise HTTPException(409, f"Only {remaining} m remain on roll {roll.roll_number}")

    issuance = FabricIssuance(
        tenant_id=UUID(tenant_id),
        roll_id=roll.id,
        issued_to_department=payload.issued_to_department,
        cmt_order_reference=payload.cmt_order_reference,
        issued_meters=meters,
        issued_kg=payload.issued_kg,
        issued_date=payload.issued_date or date.today(),
        issued_by=UUID(user_id),
        notes=payload.notes,
    )
    db.add(issuance)
    roll.issued_meters = Decimal(roll.issued_meters) + meters
    roll.status = "consumed" if roll.issued_meters >= roll.length_meters else "issued"
    await db.flush()
    await refresh_lot_status(db, await get_lot(db, roll.lot_id))
    await db.refresh(issuance)
    return issuance


async def list_issuances(db: AsyncSession, roll_id: Optional[UUID] = None, *, department: Optional[str] = None,
                         limit: int = 200, offset: int = 0):
    limit, offset = page(limit, offset)
    q = select(FabricIssuance).where(FabricIssuance.is_deleted == False)  # noqa: E712
    if roll_id:
        q = q.where(FabricIssuance.roll_id == roll_id)
    if department:
        q = q.where(FabricIssuance.issued_to_department == department)
    q = q.order_by(FabricIssuance.issued_date.desc(), FabricIssuance.created_at.desc()).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


# --------------------------------------------------------------------------- summary

async def get_lot_summary(db: AsyncSession, lot_id: UUID | str) -> LotSummary:
    lot = await get_lot(db, lot_id)
    remaining = FabricRoll.length_meters - FabricRoll.issued_meters
    row = (await db.execute(
        select(
            func.count(FabricRoll.id).label("roll_count"),
            func.coalesce(func.sum(FabricRoll.length_meters), 0).label("total"),
            func.coalesce(func.sum(remaining).filter(FabricRoll.status == "available"), 0).label("available"),
            func.coalesce(func.sum(remaining).filter(FabricRoll.status == "reserved"), 0).label("reserved"),
            func.coalesce(func.sum(FabricRoll.length_meters).filter(FabricRoll.status == "consumed"), 0).label("consumed"),
            func.coalesce(func.sum(FabricRoll.issued_meters), 0).label("issued"),
            func.coalesce(func.sum(remaining), 0).label("on_hand"),
        ).where(FabricRoll.lot_id == lot.id, FabricRoll.is_deleted == False)  # noqa: E712
    )).one()
    value = None
    if lot.cost_per_meter is not None:
        value = (Decimal(row.on_hand) * Decimal(lot.cost_per_meter)).quantize(Decimal("0.01"))
    return LotSummary(
        lot_id=lot.id,
        roll_count=row.roll_count,
        total_meters=Decimal(row.total),
        meters_available=Decimal(row.available),
        meters_reserved=Decimal(row.reserved),
        meters_consumed=Decimal(row.consumed),
        meters_issued=Decimal(row.issued),
        stock_value_pkr=value,
    )
