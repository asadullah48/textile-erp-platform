"""Reporting, Mill Pulse insights, roll traceability and CSV export.

Mill Pulse is deliberately *not* an LLM: each rule is a plain, testable
threshold over the tenant's own data, and every insight carries the evidence
that fired it. A supervisor can check any alert by hand — that is the point.
"""
import csv
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fabric import (
    FabricImport, FabricIssuance, FabricLot, FabricRoll, FabricSupplier,
    KnittingSession, WeavingSession, YarnTransaction, YarnType,
)
from app.schemas.fabric import (
    CategoryStock, ConsumptionReport, DepartmentIssue, FabricLotRead, FabricRollRead, ImportRead,
    Insight, InsightsReport, InventorySummary, IssuanceRead, KnittingSessionRead, LoomOutput,
    LowStockItem, ProductionReport, RollTrace, SupplierRead, TraceEvent, WeavingSessionRead,
    YarnStockTotals,
)
from app.services.fabric_service import get_or_404
from app.services.production_service import yarn_label

D0 = Decimal("0")
CENTS = Decimal("0.01")

# Rule thresholds — named constants so the README and tests can cite them.
DEAD_STOCK_DAYS = 90
IMPORT_TRANSIT_DAYS = 45
PORT_DWELL_DAYS = 7
YARN_COVER_DAYS = 7
YARN_USAGE_WINDOW_DAYS = 14
LOOM_WINDOW_DAYS = 30
LOOM_MIN_SESSIONS = 3
LOOM_GRADE_A_MIN_PCT = Decimal("80")

ACTIVE = FabricRoll.is_deleted == False  # noqa: E712
ON_HAND = FabricRoll.length_meters - FabricRoll.issued_meters


def _d(v) -> Decimal:
    return Decimal(v or 0)


# --------------------------------------------------------------------------- inventory

async def inventory_summary(db: AsyncSession) -> InventorySummary:
    rows = (await db.execute(
        select(
            FabricLot.fabric_category,
            func.count(func.distinct(FabricLot.id)),
            func.count(FabricRoll.id).filter(FabricRoll.status == "available"),
            func.coalesce(func.sum(ON_HAND).filter(FabricRoll.status.in_(["available", "reserved", "issued"])), 0),
            func.coalesce(func.sum(ON_HAND * FabricLot.cost_per_meter)
                          .filter(FabricRoll.status.in_(["available", "reserved", "issued"])), 0),
            func.coalesce(func.sum(ON_HAND).filter(and_(
                FabricRoll.status.in_(["available", "reserved", "issued"]),
                FabricLot.cost_per_meter.is_(None))), 0),
        )
        .select_from(FabricLot)
        .outerjoin(FabricRoll, and_(FabricRoll.lot_id == FabricLot.id, ACTIVE))
        .where(FabricLot.is_deleted == False)  # noqa: E712
        .group_by(FabricLot.fabric_category)
        .order_by(FabricLot.fabric_category)
    )).all()
    fabric = [CategoryStock(fabric_category=r[0], lots=r[1], rolls_available=r[2],
                            meters_available=_d(r[3]), stock_value_pkr=_d(r[4]).quantize(CENTS))
              for r in rows]
    unvalued = sum((_d(r[5]) for r in rows), D0)

    y = (await db.execute(
        select(
            func.count(YarnType.id),
            func.coalesce(func.sum(YarnType.current_stock_kg), 0),
            func.coalesce(func.sum(YarnType.current_stock_kg * YarnType.unit_cost_per_kg), 0),
            func.count(YarnType.id).filter(YarnType.current_stock_kg < YarnType.reorder_level_kg),
        ).where(YarnType.is_deleted == False)  # noqa: E712
    )).one()
    yarn = YarnStockTotals(yarn_types=y[0], stock_kg=_d(y[1]), stock_value_pkr=_d(y[2]).quantize(CENTS),
                           below_reorder=y[3])
    total = sum((c.stock_value_pkr for c in fabric), D0) + yarn.stock_value_pkr
    return InventorySummary(fabric=fabric, yarn=yarn, total_value_pkr=total.quantize(CENTS),
                            unvalued_meters=unvalued)


async def consumption_report(db: AsyncSession, date_from: date, date_to: date) -> ConsumptionReport:
    received = (await db.execute(
        select(func.coalesce(func.sum(FabricLot.total_meters), 0)).where(
            FabricLot.is_deleted == False,  # noqa: E712
            FabricLot.received_date.between(date_from, date_to))
    )).scalar_one()
    dept_rows = (await db.execute(
        select(FabricIssuance.issued_to_department, func.sum(FabricIssuance.issued_meters))
        .where(FabricIssuance.is_deleted == False,  # noqa: E712
               FabricIssuance.issued_date.between(date_from, date_to))
        .group_by(FabricIssuance.issued_to_department)
        .order_by(func.sum(FabricIssuance.issued_meters).desc())
    )).all()
    yarn = (await db.execute(
        select(
            func.coalesce(func.sum(YarnTransaction.quantity_kg).filter(YarnTransaction.direction == "in"), 0),
            func.coalesce(func.sum(YarnTransaction.quantity_kg).filter(YarnTransaction.direction == "out"), 0),
        ).where(YarnTransaction.is_deleted == False,  # noqa: E712
                YarnTransaction.transaction_date.between(date_from, date_to))
    )).one()
    by_dept = [DepartmentIssue(department=r[0], meters=_d(r[1])) for r in dept_rows]
    return ConsumptionReport(
        date_from=date_from, date_to=date_to, meters_received=_d(received),
        meters_issued=sum((d.meters for d in by_dept), D0), issued_by_department=by_dept,
        yarn_in_kg=_d(yarn[0]), yarn_out_kg=_d(yarn[1]),
    )


async def low_stock(db: AsyncSession) -> list[LowStockItem]:
    rows = (await db.execute(
        select(YarnType).where(YarnType.is_deleted == False,  # noqa: E712
                               YarnType.current_stock_kg < YarnType.reorder_level_kg)
        .order_by((YarnType.reorder_level_kg - YarnType.current_stock_kg).desc())
    )).scalars().all()
    return [LowStockItem(yarn_type_id=y.id, label=yarn_label(y), current_stock_kg=_d(y.current_stock_kg),
                         reorder_level_kg=_d(y.reorder_level_kg),
                         shortfall_kg=_d(y.reorder_level_kg) - _d(y.current_stock_kg)) for y in rows]


def _grade_a_pct(a: int, total: int) -> Decimal:
    return (Decimal(a) * 100 / Decimal(total)).quantize(Decimal("0.1")) if total else D0


async def production_report(db: AsyncSession, date_from: date, date_to: date) -> ProductionReport:
    grade_a = case((WeavingSession.quality_grade == "A", 1), else_=0)
    looms = (await db.execute(
        select(WeavingSession.loom_number, func.count(WeavingSession.id),
               func.sum(WeavingSession.produced_meters), func.sum(grade_a))
        .where(WeavingSession.is_deleted == False,  # noqa: E712
               WeavingSession.session_date.between(date_from, date_to))
        .group_by(WeavingSession.loom_number).order_by(WeavingSession.loom_number)
    )).all()
    k_grade_a = case((KnittingSession.quality_grade == "A", 1), else_=0)
    machines = (await db.execute(
        select(KnittingSession.machine_number, func.count(KnittingSession.id),
               func.sum(KnittingSession.produced_kg), func.sum(k_grade_a))
        .where(KnittingSession.is_deleted == False,  # noqa: E712
               KnittingSession.session_date.between(date_from, date_to))
        .group_by(KnittingSession.machine_number).order_by(KnittingSession.machine_number)
    )).all()
    grade_mix: dict[str, int] = {"A": 0, "B": 0, "C": 0}
    for model in (WeavingSession, KnittingSession):
        for g, n in (await db.execute(
            select(model.quality_grade, func.count(model.id))
            .where(model.is_deleted == False, model.session_date.between(date_from, date_to))  # noqa: E712
            .group_by(model.quality_grade)
        )).all():
            grade_mix[g] = grade_mix.get(g, 0) + n

    loom_out = [LoomOutput(machine=r[0], sessions=r[1], output=_d(r[2]), grade_a_pct=_grade_a_pct(r[3], r[1]))
                for r in looms]
    knit_out = [LoomOutput(machine=r[0], sessions=r[1], output=_d(r[2]), grade_a_pct=_grade_a_pct(r[3], r[1]))
                for r in machines]
    return ProductionReport(
        date_from=date_from, date_to=date_to,
        weaving_meters=sum((l.output for l in loom_out), D0),
        knitting_kg=sum((m.output for m in knit_out), D0),
        looms=loom_out, knitting_machines=knit_out, grade_mix=grade_mix,
    )


# --------------------------------------------------------------------------- Mill Pulse

async def insights(db: AsyncSession, today: Optional[date] = None) -> InsightsReport:
    today = today or date.today()
    found: list[Insight] = []

    # R1 / R2 — yarn below reorder level, and days of cover at recent burn rate
    since = today - timedelta(days=YARN_USAGE_WINDOW_DAYS)
    burn = dict((await db.execute(
        select(YarnTransaction.yarn_type_id, func.sum(YarnTransaction.quantity_kg))
        .where(YarnTransaction.is_deleted == False, YarnTransaction.direction == "out",  # noqa: E712
               YarnTransaction.transaction_type == "issue", YarnTransaction.transaction_date > since)
        .group_by(YarnTransaction.yarn_type_id)
    )).all())
    for y in (await db.execute(select(YarnType).where(YarnType.is_deleted == False))).scalars():  # noqa: E712
        stock, reorder = _d(y.current_stock_kg), _d(y.reorder_level_kg)
        label = yarn_label(y)
        if reorder > 0 and stock < reorder:
            found.append(Insight(
                rule="yarn_below_reorder",
                severity="critical" if stock == 0 else "warning",
                title=f"{label} is below its reorder level",
                detail=f"{stock} kg on hand against a reorder level of {reorder} kg.",
                evidence={"stock_kg": str(stock), "reorder_level_kg": str(reorder),
                          "shortfall_kg": str(reorder - stock)},
                href="/yarn",
            ))
            continue
        daily = _d(burn.get(y.id)) / YARN_USAGE_WINDOW_DAYS
        if daily > 0 and stock > 0:
            cover = (stock / daily).quantize(Decimal("0.1"))
            if cover < YARN_COVER_DAYS:
                found.append(Insight(
                    rule="yarn_runway",
                    severity="warning",
                    title=f"{label}: about {cover} days of cover left",
                    detail=(f"At the last {YARN_USAGE_WINDOW_DAYS} days' average burn of "
                            f"{daily.quantize(Decimal('0.1'))} kg/day, stock runs out before a typical reorder lands."),
                    evidence={"stock_kg": str(stock), "avg_daily_issue_kg": str(daily.quantize(Decimal('0.01'))),
                              "days_of_cover": str(cover)},
                    href="/yarn",
                ))

    # R3 — dead stock: in-stock lots with nothing issued for DEAD_STOCK_DAYS
    dead = (await db.execute(
        select(FabricLot, func.coalesce(func.sum(ON_HAND), 0))
        .join(FabricRoll, and_(FabricRoll.lot_id == FabricLot.id, ACTIVE))
        .where(FabricLot.is_deleted == False, FabricLot.status == "in_stock",  # noqa: E712
               FabricLot.received_date < today - timedelta(days=DEAD_STOCK_DAYS))
        .group_by(FabricLot.id)
    )).all()
    for lot, meters in dead:
        meters = _d(meters)
        if meters <= 0:
            continue
        age = (today - lot.received_date).days
        value = (meters * _d(lot.cost_per_meter)).quantize(CENTS) if lot.cost_per_meter is not None else None
        found.append(Insight(
            rule="dead_stock",
            severity="warning",
            title=f"Lot {lot.lot_number} untouched for {age} days",
            detail=(f"{meters} m of {lot.fabric_type} has not been issued since it arrived"
                    + (f" — PKR {value:,} of working capital sitting on the rack." if value else ".")),
            evidence={"age_days": str(age), "meters_on_hand": str(meters),
                      "value_pkr": str(value) if value is not None else "unvalued"},
            href=f"/fabric-lots/{lot.id}",
        ))

    # R4 / R5 — imports stuck in transit, or cleared but lingering at port
    for imp in (await db.execute(select(FabricImport).where(
            FabricImport.is_deleted == False, FabricImport.status.in_(["in_transit", "cleared"])))).scalars():  # noqa: E712
        if imp.status == "in_transit" and (today - imp.lc_opened_date).days > IMPORT_TRANSIT_DAYS:
            days = (today - imp.lc_opened_date).days
            found.append(Insight(
                rule="import_overdue", severity="warning",
                title=f"LC {imp.lc_number} in transit for {days} days",
                detail=f"No clearance recorded {days} days after the LC was opened (threshold {IMPORT_TRANSIT_DAYS}).",
                evidence={"lc_opened": imp.lc_opened_date.isoformat(), "days": str(days)},
                href="/imports",
            ))
        if imp.status == "cleared" and imp.clearance_date and (today - imp.clearance_date).days > PORT_DWELL_DAYS:
            days = (today - imp.clearance_date).days
            found.append(Insight(
                rule="port_dwell", severity="critical",
                title=f"LC {imp.lc_number} cleared {days} days ago but not warehoused",
                detail=f"Cargo at {imp.port_of_entry} past {PORT_DWELL_DAYS} days risks demurrage and storage charges.",
                evidence={"cleared": imp.clearance_date.isoformat(), "days": str(days), "port": imp.port_of_entry},
                href="/imports",
            ))

    # R6 — loom quality drift
    window = today - timedelta(days=LOOM_WINDOW_DAYS)
    grade_a = case((WeavingSession.quality_grade == "A", 1), else_=0)
    for loom, n, a in (await db.execute(
        select(WeavingSession.loom_number, func.count(WeavingSession.id), func.sum(grade_a))
        .where(WeavingSession.is_deleted == False, WeavingSession.session_date > window)  # noqa: E712
        .group_by(WeavingSession.loom_number)
    )).all():
        pct = _grade_a_pct(a, n)
        if n >= LOOM_MIN_SESSIONS and pct < LOOM_GRADE_A_MIN_PCT:
            found.append(Insight(
                rule="loom_quality", severity="warning",
                title=f"Loom {loom}: only {pct}% A-grade",
                detail=(f"{a} of {n} sessions in the last {LOOM_WINDOW_DAYS} days were A-grade "
                        f"(target ≥ {LOOM_GRADE_A_MIN_PCT}%). Check tension, beam and operator rotation."),
                evidence={"sessions": str(n), "grade_a": str(a), "grade_a_pct": str(pct)},
                href="/weaving",
            ))

    # R7 — stock that cannot be valued
    unvalued = (await db.execute(
        select(func.count(func.distinct(FabricLot.id)), func.coalesce(func.sum(ON_HAND), 0))
        .join(FabricRoll, and_(FabricRoll.lot_id == FabricLot.id, ACTIVE))
        .where(FabricLot.is_deleted == False, FabricLot.cost_per_meter.is_(None),  # noqa: E712
               FabricRoll.status.in_(["available", "reserved", "issued"]))
    )).one()
    if unvalued[0]:
        found.append(Insight(
            rule="unvalued_stock", severity="info",
            title=f"{unvalued[0]} lot(s) have no cost per meter",
            detail=f"{_d(unvalued[1])} m on hand is excluded from stock valuation until a cost is set.",
            evidence={"lots": str(unvalued[0]), "meters": str(_d(unvalued[1]))},
            href="/fabric-lots",
        ))

    order = {"critical": 0, "warning": 1, "info": 2}
    found.sort(key=lambda i: order[i.severity])
    return InsightsReport(generated_at=datetime.now(timezone.utc), rules_evaluated=7, insights=found)


# --------------------------------------------------------------------------- traceability

async def roll_trace(db: AsyncSession, roll_id: UUID) -> RollTrace:
    """Roll genealogy: supplier / LC → lot → looms that wove it → every issuance.
    The record an export buyer's compliance auditor asks for."""
    roll = await get_or_404(db, FabricRoll, roll_id, "Fabric roll")
    lot = await get_or_404(db, FabricLot, roll.lot_id, "Fabric lot")
    supplier = None
    if lot.supplier_id:
        supplier = (await db.execute(select(FabricSupplier).where(FabricSupplier.id == lot.supplier_id))).scalar_one_or_none()
    imp = None
    if lot.import_id:
        imp = (await db.execute(select(FabricImport).where(FabricImport.id == lot.import_id))).scalar_one_or_none()
    # Only sessions on or before the roll was registered can have produced it.
    made_by = roll.created_at.date()
    weaving = (await db.execute(select(WeavingSession).where(
        WeavingSession.lot_id == lot.id, WeavingSession.is_deleted == False,  # noqa: E712
        WeavingSession.session_date <= made_by)
        .order_by(WeavingSession.session_date))).scalars().all()
    knitting = (await db.execute(select(KnittingSession).where(
        KnittingSession.lot_id == lot.id, KnittingSession.is_deleted == False,  # noqa: E712
        KnittingSession.session_date <= made_by)
        .order_by(KnittingSession.session_date))).scalars().all()
    issuances = (await db.execute(select(FabricIssuance).where(
        FabricIssuance.roll_id == roll.id, FabricIssuance.is_deleted == False)  # noqa: E712
        .order_by(FabricIssuance.issued_date))).scalars().all()

    t: list[TraceEvent] = []
    if imp:
        t.append(TraceEvent(at=imp.lc_opened_date, kind="import", title=f"LC {imp.lc_number} opened",
                            detail=f"{imp.quantity_meters} m {imp.fabric_type}, {imp.currency} {imp.fob_cost:,} FOB"))
        if imp.clearance_date:
            t.append(TraceEvent(at=imp.clearance_date, kind="import", title=f"Cleared at {imp.port_of_entry}",
                                detail=f"Landed cost PKR {imp.landed_cost_per_meter_pkr}/m"))
    verb = "received" if (lot.supplier or imp) else "completed"
    t.append(TraceEvent(at=lot.received_date, kind="lot", title=f"Lot {lot.lot_number} {verb}",
                        detail=f"{lot.fabric_type} · {lot.color}" + (f" · from {supplier.name}" if supplier else "")))
    for w in weaving:
        t.append(TraceEvent(at=w.session_date, kind="weaving",
                            title=f"Woven on loom {w.loom_number} ({w.shift} shift)",
                            detail=f"{w.produced_meters} m · grade {w.quality_grade}"
                                   + (f" · operator {w.operator_name}" if w.operator_name else "")))
    for k in knitting:
        t.append(TraceEvent(at=k.session_date, kind="knitting",
                            title=f"Knitted on machine {k.machine_number}",
                            detail=f"{k.produced_kg} kg · grade {k.quality_grade}"))
    t.append(TraceEvent(at=roll.created_at.date(), kind="roll", title=f"Roll {roll.roll_number} registered",
                        detail=f"{roll.length_meters} m" + (f" · {roll.location}" if roll.location else "")))
    for i in issuances:
        t.append(TraceEvent(at=i.issued_date, kind="issue", title=f"Issued to {i.issued_to_department}",
                            detail=f"{i.issued_meters} m" + (f" · order {i.cmt_order_reference}" if i.cmt_order_reference else "")))
    # Same-day events follow the physical order: production → lot → roll → issue.
    rank = {"import": 0, "weaving": 1, "knitting": 1, "lot": 2, "roll": 3, "issue": 4}
    t.sort(key=lambda e: (e.at, rank[e.kind]))

    return RollTrace(
        roll=FabricRollRead.model_validate(roll),
        lot=FabricLotRead.model_validate(lot),
        supplier=SupplierRead.model_validate(supplier) if supplier else None,
        fabric_import=ImportRead.model_validate(imp) if imp else None,
        weaving_sessions=[WeavingSessionRead.model_validate(w) for w in weaving],
        knitting_sessions=[KnittingSessionRead.model_validate(k) for k in knitting],
        issuances=[IssuanceRead.model_validate(i) for i in issuances],
        timeline=t,
    )


# --------------------------------------------------------------------------- CSV

async def stock_csv(db: AsyncSession) -> str:
    rows = (await db.execute(
        select(FabricRoll, FabricLot)
        .join(FabricLot, FabricLot.id == FabricRoll.lot_id)
        .where(ACTIVE, FabricLot.is_deleted == False)  # noqa: E712
        .order_by(FabricLot.lot_number, FabricRoll.roll_number)
    )).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["lot_number", "fabric_category", "fabric_type", "color", "supplier", "roll_number",
                "status", "grade", "length_m", "issued_m", "on_hand_m", "location",
                "cost_per_meter_pkr", "on_hand_value_pkr"])
    for roll, lot in rows:
        on_hand = _d(roll.length_meters) - _d(roll.issued_meters)
        value = (on_hand * _d(lot.cost_per_meter)).quantize(CENTS) if lot.cost_per_meter is not None else ""
        w.writerow([lot.lot_number, lot.fabric_category, lot.fabric_type, lot.color, lot.supplier or "",
                    roll.roll_number, roll.status, roll.grade or "", roll.length_meters, roll.issued_meters,
                    on_hand, roll.location or "", lot.cost_per_meter if lot.cost_per_meter is not None else "",
                    value])
    return buf.getvalue()
