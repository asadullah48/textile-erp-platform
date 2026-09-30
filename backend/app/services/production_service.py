"""Yarn stock ledger and production (weaving / knitting) sessions.

Stock invariant: yarn_types.current_stock_kg == the balance_after_kg of the
latest transaction, and never goes negative (also a DB CHECK constraint).
Every movement locks the yarn row first, so concurrent issues serialise
instead of racing past the balance check.
"""
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fabric import FabricLot, KnittingSession, WeavingSession, YarnTransaction, YarnType
from app.schemas.fabric import (
    KnittingSessionCreate, KnittingSessionUpdate, WeavingSessionCreate, WeavingSessionUpdate,
    YarnTransactionCreate, YarnTypeCreate, YarnTypeUpdate,
)
from app.services.fabric_service import apply_patch, get_or_404, page, soft_delete


def yarn_label(y: YarnType) -> str:
    ply = f"/{y.ply}" if y.ply and y.ply > 1 and "/" not in y.yarn_count else ""
    color = f" · {y.color_name}" if y.color_name else ""
    return f"{y.yarn_count}{ply} {y.fiber_type.title()}{color}"


# --------------------------------------------------------------------------- yarn types

async def list_yarn_types(db: AsyncSession, fiber_type: Optional[str], low_stock_only: bool,
                          limit: int, offset: int):
    limit, offset = page(limit, offset)
    q = select(YarnType).where(YarnType.is_deleted == False)  # noqa: E712
    if fiber_type:
        q = q.where(YarnType.fiber_type == fiber_type)
    if low_stock_only:
        q = q.where(YarnType.current_stock_kg < YarnType.reorder_level_kg)
    q = q.order_by(YarnType.fiber_type, YarnType.yarn_count).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


async def create_yarn_type(db: AsyncSession, tenant_id: str, user_id: str, payload: YarnTypeCreate) -> YarnType:
    if payload.supplier_id:
        from app.models.fabric import FabricSupplier
        await get_or_404(db, FabricSupplier, payload.supplier_id, "Supplier")
    data = payload.model_dump(exclude={"opening_stock_kg"})
    yarn = YarnType(tenant_id=UUID(tenant_id), current_stock_kg=Decimal("0"), **data)
    db.add(yarn)
    await db.flush()
    if payload.opening_stock_kg > 0:
        await post_transaction(
            db, tenant_id, user_id, yarn.id,
            YarnTransactionCreate(
                transaction_type="receipt", quantity_kg=payload.opening_stock_kg,
                unit_cost=payload.unit_cost_per_kg, notes="Opening stock",
            ),
        )
    await db.refresh(yarn)
    return yarn


async def update_yarn_type(db: AsyncSession, yarn_id: UUID, payload: YarnTypeUpdate) -> YarnType:
    yarn = await get_or_404(db, YarnType, yarn_id, "Yarn type")
    apply_patch(yarn, payload)
    await db.flush()
    await db.refresh(yarn)
    return yarn


async def delete_yarn_type(db: AsyncSession, yarn_id: UUID) -> None:
    yarn = await get_or_404(db, YarnType, yarn_id, "Yarn type")
    if yarn.current_stock_kg > 0:
        raise HTTPException(409, "Yarn still has stock on hand; write it off or issue it first")
    await soft_delete(db, yarn)


async def post_transaction(db: AsyncSession, tenant_id: str, user_id: str, yarn_id: UUID,
                           payload: YarnTransactionCreate, *, source: str = "manual") -> YarnTransaction:
    yarn = await get_or_404(db, YarnType, yarn_id, "Yarn type", for_update=True)
    qty = Decimal(payload.quantity_kg)
    current = Decimal(yarn.current_stock_kg)
    if payload.direction == "out":
        if qty > current:
            raise HTTPException(
                409, f"Insufficient stock for {yarn_label(yarn)}: {current} kg on hand, {qty} kg requested")
        balance = current - qty
    else:
        balance = current + qty

    unit_cost = payload.unit_cost if payload.unit_cost is not None else yarn.unit_cost_per_kg
    txn = YarnTransaction(
        tenant_id=UUID(tenant_id),
        yarn_type_id=yarn.id,
        transaction_type=payload.transaction_type,
        direction=payload.direction,
        quantity_kg=qty,
        balance_after_kg=balance,
        unit_cost=unit_cost,
        total_cost=(qty * Decimal(unit_cost)).quantize(Decimal("0.01")) if unit_cost is not None else None,
        lot_reference=payload.lot_reference,
        order_reference=payload.order_reference,
        source=source,
        transaction_date=payload.transaction_date or date.today(),
        notes=payload.notes,
        created_by=UUID(user_id),
    )
    db.add(txn)
    yarn.current_stock_kg = balance
    # A receipt at a new price updates the standard cost used for valuation.
    if payload.transaction_type == "receipt" and payload.unit_cost is not None:
        yarn.unit_cost_per_kg = payload.unit_cost
    await db.flush()
    await db.refresh(txn)
    return txn


async def list_transactions(db: AsyncSession, yarn_id: UUID, date_from: Optional[date],
                            date_to: Optional[date], limit: int, offset: int):
    await get_or_404(db, YarnType, yarn_id, "Yarn type")
    limit, offset = page(limit, offset)
    q = select(YarnTransaction).where(YarnTransaction.yarn_type_id == yarn_id,
                                      YarnTransaction.is_deleted == False)  # noqa: E712
    if date_from:
        q = q.where(YarnTransaction.transaction_date >= date_from)
    if date_to:
        q = q.where(YarnTransaction.transaction_date <= date_to)
    q = q.order_by(YarnTransaction.seq.desc()).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


# --------------------------------------------------------------------------- weaving

async def list_weaving(db: AsyncSession, lot_id: Optional[UUID], loom: Optional[str],
                       date_from: Optional[date], date_to: Optional[date], limit: int, offset: int):
    limit, offset = page(limit, offset)
    q = select(WeavingSession).where(WeavingSession.is_deleted == False)  # noqa: E712
    if lot_id:
        q = q.where(WeavingSession.lot_id == lot_id)
    if loom:
        q = q.where(WeavingSession.loom_number == loom)
    if date_from:
        q = q.where(WeavingSession.session_date >= date_from)
    if date_to:
        q = q.where(WeavingSession.session_date <= date_to)
    q = q.order_by(WeavingSession.session_date.desc(), WeavingSession.created_at.desc()).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


async def create_weaving(db: AsyncSession, tenant_id: str, user_id: str,
                         payload: WeavingSessionCreate) -> WeavingSession:
    lot = await get_or_404(db, FabricLot, payload.lot_id, "Fabric lot")
    data = payload.model_dump()
    session = WeavingSession(tenant_id=UUID(tenant_id), **data)
    if payload.yarn_type_id:
        txn = await post_transaction(
            db, tenant_id, user_id, payload.yarn_type_id,
            YarnTransactionCreate(
                transaction_type="issue", quantity_kg=payload.yarn_consumed_kg,
                lot_reference=lot.lot_number, transaction_date=payload.session_date,
                notes=f"Weaving · loom {payload.loom_number} · {payload.shift} shift",
            ),
            source="weaving",
        )
        session.yarn_transaction_id = txn.id
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def update_weaving(db: AsyncSession, session_id: UUID, payload: WeavingSessionUpdate) -> WeavingSession:
    s = await get_or_404(db, WeavingSession, session_id, "Weaving session")
    apply_patch(s, payload)
    await db.flush()
    await db.refresh(s)
    return s


# --------------------------------------------------------------------------- knitting

async def list_knitting(db: AsyncSession, yarn_type_id: Optional[UUID], machine: Optional[str],
                        date_from: Optional[date], date_to: Optional[date], limit: int, offset: int):
    limit, offset = page(limit, offset)
    q = select(KnittingSession).where(KnittingSession.is_deleted == False)  # noqa: E712
    if yarn_type_id:
        q = q.where(KnittingSession.yarn_type_id == yarn_type_id)
    if machine:
        q = q.where(KnittingSession.machine_number == machine)
    if date_from:
        q = q.where(KnittingSession.session_date >= date_from)
    if date_to:
        q = q.where(KnittingSession.session_date <= date_to)
    q = q.order_by(KnittingSession.session_date.desc(), KnittingSession.created_at.desc()).limit(limit).offset(offset)
    return (await db.execute(q)).scalars().all()


async def create_knitting(db: AsyncSession, tenant_id: str, user_id: str,
                          payload: KnittingSessionCreate) -> KnittingSession:
    lot_ref = None
    if payload.lot_id:
        lot_ref = (await get_or_404(db, FabricLot, payload.lot_id, "Fabric lot")).lot_number
    txn = await post_transaction(
        db, tenant_id, user_id, payload.yarn_type_id,
        YarnTransactionCreate(
            transaction_type="issue", quantity_kg=payload.yarn_consumed_kg,
            lot_reference=lot_ref, transaction_date=payload.session_date,
            notes=f"Knitting · machine {payload.machine_number} · {payload.shift} shift",
        ),
        source="knitting",
    )
    session = KnittingSession(tenant_id=UUID(tenant_id), yarn_transaction_id=txn.id, **payload.model_dump())
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def update_knitting(db: AsyncSession, session_id: UUID, payload: KnittingSessionUpdate) -> KnittingSession:
    s = await get_or_404(db, KnittingSession, session_id, "Knitting session")
    apply_patch(s, payload)
    await db.flush()
    await db.refresh(s)
    return s
