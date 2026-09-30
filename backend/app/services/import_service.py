"""Imported fabric (LC) tracking.

Landed cost is always computed server-side from its components — a client can
never submit a total that disagrees with its own parts:

    total_landed_cost_pkr = fob_cost × exchange_rate + freight + insurance + duties
    landed_cost_per_meter = total_landed_cost_pkr / quantity_meters

Status moves forward only: in_transit → cleared → warehoused → consumed.
"""
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fabric import FabricImport, FabricLot, FabricRoll, FabricSupplier
from app.schemas.fabric import ImportCreate, ImportUpdate, ReceiveImportRequest
from app.services import fabric_service
from app.services.fabric_service import apply_patch, get_or_404, page

STATUS_ORDER = ["in_transit", "cleared", "warehoused", "consumed"]


def landed_cost(fob: Decimal, rate: Decimal, freight: Decimal, insurance: Decimal,
                duties: Decimal, meters: Decimal) -> tuple[Decimal, Decimal]:
    total = (Decimal(fob) * Decimal(rate) + Decimal(freight) + Decimal(insurance) + Decimal(duties)) \
        .quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    per_meter = (total / Decimal(meters)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return total, per_meter


def _recompute(imp: FabricImport) -> None:
    imp.total_landed_cost_pkr, imp.landed_cost_per_meter_pkr = landed_cost(
        imp.fob_cost, imp.exchange_rate, imp.freight_cost_pkr, imp.insurance_cost_pkr,
        imp.duties_paid_pkr, imp.quantity_meters,
    )


async def list_imports(db: AsyncSession, status: Optional[str], supplier_id: Optional[UUID],
                       limit: int, offset: int):
    limit, offset = page(limit, offset)
    q = select(FabricImport).where(FabricImport.is_deleted == False)  # noqa: E712
    if status:
        q = q.where(FabricImport.status == status)
    if supplier_id:
        q = q.where(FabricImport.supplier_id == supplier_id)
    q = q.order_by(FabricImport.lc_opened_date.desc(), FabricImport.created_at.desc()).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


async def create_import(db: AsyncSession, tenant_id: str, payload: ImportCreate) -> FabricImport:
    await get_or_404(db, FabricSupplier, payload.supplier_id, "Supplier")
    clash = (await db.execute(select(FabricImport.id).where(
        FabricImport.lc_number == payload.lc_number, FabricImport.is_deleted == False))).first()  # noqa: E712
    if clash:
        raise HTTPException(409, f"LC '{payload.lc_number}' already exists")
    imp = FabricImport(tenant_id=UUID(tenant_id), status="in_transit", **payload.model_dump())
    _recompute(imp)
    db.add(imp)
    await db.flush()
    await db.refresh(imp)
    return imp


async def get_import(db: AsyncSession, import_id: UUID) -> FabricImport:
    return await get_or_404(db, FabricImport, import_id, "Import")


def _check_transition(current: str, new: str) -> None:
    if STATUS_ORDER.index(new) < STATUS_ORDER.index(current):
        raise HTTPException(409, f"Import status cannot move back from '{current}' to '{new}'")


async def update_import(db: AsyncSession, import_id: UUID, payload: ImportUpdate) -> FabricImport:
    imp = await get_import(db, import_id)
    if payload.status and payload.status != imp.status:
        _check_transition(imp.status, payload.status)
        if payload.status == "warehoused":
            raise HTTPException(409, "Use POST /fabric-imports/{id}/receive to warehouse an import — it opens the lot")
        if payload.status == "cleared" and not (payload.clearance_date or imp.clearance_date):
            payload.clearance_date = date.today()
    cost_locked = imp.status in ("warehoused", "consumed")
    cost_fields = {"exchange_rate", "freight_cost_pkr", "insurance_cost_pkr", "duties_paid_pkr"}
    if cost_locked and cost_fields & payload.model_fields_set:
        raise HTTPException(409, "Costs are locked once an import is warehoused (its lot is already valued)")
    apply_patch(imp, payload)
    _recompute(imp)
    await db.flush()
    await db.refresh(imp)
    return imp


async def receive_import(db: AsyncSession, tenant_id: str, import_id: UUID,
                         payload: ReceiveImportRequest) -> FabricLot:
    """Warehouse an import: status → warehoused, and open a lot valued at landed cost.
    Optionally splits the quantity into N rolls (last roll absorbs the rounding)."""
    imp = await get_or_404(db, FabricImport, import_id, "Import", for_update=True)
    if imp.status in ("warehoused", "consumed"):
        raise HTTPException(409, f"Import is already {imp.status}")
    existing = (await db.execute(select(FabricLot.id).where(
        FabricLot.import_id == imp.id, FabricLot.is_deleted == False))).first()  # noqa: E712
    if existing:
        raise HTTPException(409, "A lot already exists for this import")

    supplier = await get_or_404(db, FabricSupplier, imp.supplier_id, "Supplier")
    arrival = payload.warehouse_arrival_date or date.today()
    from app.schemas.fabric import FabricLotCreate
    lot = await fabric_service.create_lot(db, tenant_id, FabricLotCreate(
        lot_number=payload.lot_number,
        fabric_type=imp.fabric_type,
        fabric_category="imported",
        color=payload.color,
        total_meters=imp.quantity_meters,
        received_date=arrival,
        supplier=supplier.name,
        supplier_id=supplier.id,
        cost_per_meter=imp.landed_cost_per_meter_pkr,
        status="in_stock",
        notes=f"LC {imp.lc_number}" + (f" · B/L {imp.shipment_reference}" if imp.shipment_reference else ""),
    ))
    lot.import_id = imp.id

    if payload.roll_count:
        prefix = payload.roll_prefix or f"{payload.lot_number}-R"
        each = (Decimal(imp.quantity_meters) / payload.roll_count).quantize(Decimal("0.01"))
        numbers = [f"{prefix}{str(i + 1).zfill(3)}" for i in range(payload.roll_count)]
        await fabric_service._ensure_unique_roll_numbers(db, numbers)
        for i, n in enumerate(numbers):
            length = each if i < payload.roll_count - 1 else Decimal(imp.quantity_meters) - each * (payload.roll_count - 1)
            db.add(FabricRoll(tenant_id=UUID(tenant_id), lot_id=lot.id, roll_number=n,
                              length_meters=length, location=payload.location, status="available"))

    if imp.clearance_date is None:
        imp.clearance_date = arrival
    imp.warehouse_arrival_date = arrival
    imp.status = "warehoused"
    await db.flush()
    await db.refresh(lot)
    return lot
