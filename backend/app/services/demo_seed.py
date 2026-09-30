"""Seed a realistic Faisalabad weaving + knitting mill for demo workspaces.

Everything goes through the real service layer (not raw INSERTs), so seeded
data obeys the same invariants as user data: yarn balances come from the
ledger, lot statuses are derived from issuances, landed cost is computed.
Dates are relative to today so the Mill Pulse rules always have something
real to find. All business names are fictional.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal as D
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.fabric import (
    FabricLotCreate, FabricRollBulkCreate, ImportCreate, ImportUpdate, IssueRollRequest,
    KnittingSessionCreate, ReceiveImportRequest, SupplierCreate, WeavingSessionCreate,
    YarnTransactionCreate, YarnTypeCreate,
)
from app.services import fabric_service as fs
from app.services import import_service as imps
from app.services import production_service as ps


async def seed_demo_data(db: AsyncSession, tenant_id: UUID, user_id: UUID) -> None:
    t, u = str(tenant_id), str(user_id)
    today = date.today()

    def ago(days: int) -> date:
        return today - timedelta(days=days)

    # ---- suppliers ----------------------------------------------------------
    chenab = await fs.create_supplier(db, t, SupplierCreate(
        name="Chenab Yarn Traders", contact_person="Imran Butt", phone="+92 41 555 0101",
        city="Faisalabad", payment_terms="30 days", notes="Primary cotton yarn source"))
    ravi = await fs.create_supplier(db, t, SupplierCreate(
        name="Ravi Poly Fibres", contact_person="Sana Qureshi", phone="+92 42 555 0144",
        city="Lahore", payment_terms="Advance"))
    lyallpur = await fs.create_supplier(db, t, SupplierCreate(
        name="Lyallpur Greige House", contact_person="Tariq Javed", phone="+92 41 555 0190",
        city="Faisalabad", payment_terms="45 days"))
    seaview = await fs.create_supplier(db, t, SupplierCreate(
        name="Seaview Textile Export Co.", contact_person="Li Wen", country="CN",
        city="Ningbo", payment_terms="90 days LC at sight"))
    anatolia = await fs.create_supplier(db, t, SupplierCreate(
        name="Anatolia Denim Mills", contact_person="Emre Kaya", country="TR",
        city="Denizli", payment_terms="60 days LC"))

    # ---- yarn ---------------------------------------------------------------
    c20 = await ps.create_yarn_type(db, t, u, YarnTypeCreate(
        yarn_count="20/1", fiber_type="cotton", color_name="Raw White", supplier_id=chenab.id,
        unit_cost_per_kg=D("890"), reorder_level_kg=D("1500"), opening_stock_kg=D("4200")))
    c30 = await ps.create_yarn_type(db, t, u, YarnTypeCreate(
        yarn_count="30/1", fiber_type="cotton", color_name="Combed", supplier_id=chenab.id,
        unit_cost_per_kg=D("1040"), reorder_level_kg=D("600"), opening_stock_kg=D("2900")))
    p150 = await ps.create_yarn_type(db, t, u, YarnTypeCreate(
        yarn_count="150D", fiber_type="polyester", color_name="Optical White", supplier_id=ravi.id,
        unit_cost_per_kg=D("610"), reorder_level_kg=D("800"), opening_stock_kg=D("650")))
    cvc = await ps.create_yarn_type(db, t, u, YarnTypeCreate(
        yarn_count="24/1", fiber_type="blended", color_name="60/40 CVC Grey Melange", supplier_id=ravi.id,
        unit_cost_per_kg=D("760"), reorder_level_kg=D("600"), opening_stock_kg=D("2300")))
    await ps.post_transaction(db, t, u, c20.id, YarnTransactionCreate(
        transaction_type="receipt", quantity_kg=D("1800"), unit_cost=D("905"),
        transaction_date=ago(20), notes="GRN 4471 · truck LES-2291"))
    await ps.post_transaction(db, t, u, c30.id, YarnTransactionCreate(
        transaction_type="wastage", quantity_kg=D("35"), transaction_date=ago(9),
        notes="Moisture damage, bay 3"))

    # ---- in-house woven / knitted lots ---------------------------------------
    # In-house lots carry no supplier: the looms below produced them. The lot's
    # date is the day the last piece was doffed and the rolls were registered,
    # so every production session precedes the rolls it made.
    woven1 = await fs.create_lot(db, t, FabricLotCreate(
        lot_number="FSD-W-2409", fabric_type="100% Cotton Poplin 40x40", fabric_category="woven",
        color="Greige", gsm=D("115"), width_cm=D("147"), total_meters=D("2400"),
        received_date=ago(8), cost_per_meter=D("312"), notes="Woven in-house · looms L-07 / L-12"))
    rolls_w1 = await fs.bulk_create_rolls(db, t, str(woven1.id), FabricRollBulkCreate(
        prefix="W2409-", count=24, length_meters=D("100"), weight_kg=D("17.2"), grade="A",
        location="Rack A-3"))

    woven2 = await fs.create_lot(db, t, FabricLotCreate(
        lot_number="FSD-W-2410", fabric_type="PC Twill 2/1 (cotton warp, poly weft)", fabric_category="woven",
        color="Natural", gsm=D("190"), width_cm=D("152"), total_meters=D("1800"),
        received_date=ago(1), cost_per_meter=D("398"), notes="Woven in-house · looms L-03 / L-07 / L-12 / L-21"))
    rolls_w2 = await fs.bulk_create_rolls(db, t, str(woven2.id), FabricRollBulkCreate(
        prefix="W2410-", count=18, length_meters=D("100"), weight_kg=D("28.9"), location="Rack B-1"))

    knit1 = await fs.create_lot(db, t, FabricLotCreate(
        lot_number="FSD-K-0931", fabric_type="Single Jersey 30s", fabric_category="knitted",
        color="Raw White", gsm=D("160"), width_cm=D("183"), total_meters=D("1500"),
        received_date=ago(2), cost_per_meter=D("265"), notes="Knitted in-house · machines KM-2 / KM-4"))
    await fs.bulk_create_rolls(db, t, str(knit1.id), FabricRollBulkCreate(
        prefix="K0931-", count=12, length_meters=D("125"), weight_kg=D("36.4"), location="Bay 2"))

    # ---- purchased greige ----------------------------------------------------
    greige = await fs.create_lot(db, t, FabricLotCreate(
        lot_number="LGH-G-2412", fabric_type="Cotton Lawn 60x60", fabric_category="woven",
        color="Greige", gsm=D("95"), width_cm=D("142"), total_meters=D("1200"),
        received_date=ago(16), supplier_id=lyallpur.id, cost_per_meter=D("285"), notes="Bill 7731 · 45 days"))
    rolls_g = await fs.bulk_create_rolls(db, t, str(greige.id), FabricRollBulkCreate(
        prefix="G2412-", count=12, length_meters=D("100"), weight_kg=D("14.1"), location="Rack C-2"))

    # Dead stock on purpose — 120 days on the rack, nothing issued.
    old = await fs.create_lot(db, t, FabricLotCreate(
        lot_number="FSD-W-2305", fabric_type="Cotton Canvas 10oz", fabric_category="woven",
        color="Khaki", gsm=D("340"), width_cm=D("150"), total_meters=D("900"),
        received_date=ago(120), supplier_id=lyallpur.id, cost_per_meter=D("540"),
        notes="Order cancelled by buyer"))
    await fs.bulk_create_rolls(db, t, str(old.id), FabricRollBulkCreate(
        prefix="W2305-", count=9, length_meters=D("100"), location="Rack D-7"))

    # Unvalued lot on purpose — free-text supplier, no cost yet.
    await fs.create_lot(db, t, FabricLotCreate(
        lot_number="FSD-W-2411", fabric_type="Cambric 60x60", color="Greige",
        total_meters=D("600"), received_date=ago(2), supplier="Walk-in trader (Jhang Bazar)"))
    unv = (await fs.list_lots(db, search="FSD-W-2411"))[0]
    await fs.bulk_create_rolls(db, t, str(unv.id), FabricRollBulkCreate(
        prefix="W2411-", count=6, length_meters=D("100"), location="Receiving"))

    # Rolls arrive with their lot, not "today" — keeps traceability timelines honest.
    from sqlalchemy import select
    from app.models.fabric import FabricLot, FabricRoll
    for roll, received in (await db.execute(
        select(FabricRoll, FabricLot.received_date).join(FabricLot, FabricLot.id == FabricRoll.lot_id)
    )).all():
        roll.created_at = datetime.combine(received, time(9), tzinfo=timezone.utc)

    # ---- weaving + knitting production (posts yarn issues to the ledger) ----
    loom_plan = [  # (days ago, loom, shift, meters, grade, yarn kg)
        (14, "L-07", "day", 420, "A", 118), (13, "L-07", "night", 395, "A", 111),
        (12, "L-12", "day", 380, "B", 108), (11, "L-12", "night", 360, "C", 104),
        (10, "L-12", "day", 402, "B", 113), (9, "L-07", "day", 430, "A", 120),
        (8, "L-12", "night", 355, "A", 101), (6, "L-03", "day", 410, "A", 116),
        (5, "L-07", "night", 388, "A", 109), (4, "L-12", "day", 372, "B", 105),
        (3, "L-03", "night", 400, "A", 113), (2, "L-07", "day", 425, "A", 119),
        (1, "L-03", "day", 418, "A", 117),
    ]
    operators = {"L-07": "Muhammad Aslam", "L-12": "Shahid Iqbal", "L-03": "Nadeem Akhtar"}
    for days, loom, shift, meters, grade, kg in loom_plan:
        await ps.create_weaving(db, t, u, WeavingSessionCreate(
            lot_id=woven1.id if days >= 8 else woven2.id, loom_number=loom,
            operator_name=operators[loom], session_date=ago(days), shift=shift,
            picks_per_inch=72, ends_per_inch=132, produced_meters=D(meters), quality_grade=grade,
            yarn_type_id=c20.id, yarn_consumed_kg=D(kg)))
    # Polyester burns fast — drives the "days of cover" rule.
    for days, kg in [(12, 60), (9, 55), (6, 62), (3, 58), (1, 57)]:
        await ps.create_weaving(db, t, u, WeavingSessionCreate(
            lot_id=woven2.id, loom_number="L-21", operator_name="Asif Mehmood",
            session_date=ago(days), shift="day", produced_meters=D("210"), quality_grade="A",
            yarn_type_id=p150.id, yarn_consumed_kg=D(kg)))
    for days, machine, kg_out, grade in [(8, "KM-2", 410, "A"), (7, "KM-2", 395, "A"),
                                          (6, "KM-4", 380, "B"), (4, "KM-4", 402, "A"),
                                          (2, "KM-2", 415, "A")]:
        await ps.create_knitting(db, t, u, KnittingSessionCreate(
            yarn_type_id=c30.id, lot_id=knit1.id, machine_number=machine, operator_name="Rizwan Ali",
            session_date=ago(days), shift="day", gauge=24, course_count=18,
            produced_kg=D(kg_out), yarn_consumed_kg=(D(kg_out) * D("1.04")).quantize(D("0.001")),
            quality_grade=grade))

    # ---- issuances to CMT departments ----------------------------------------
    plan = [(rolls_w1[0], "cutting", None, "PO-SIA-1182", 6), (rolls_w1[1], "cutting", None, "PO-SIA-1182", 6),
            (rolls_w1[2], "cutting", D("60"), "PO-SIA-1182", 5), (rolls_w1[3], "sampling", D("12"), None, 4),
            (rolls_w1[4], "cutting", None, "PO-KHI-0417", 3), (rolls_w2[0], "dyeing", None, "DY-0092", 0),
            (rolls_w2[1], "dyeing", D("45"), "DY-0092", 0), (rolls_g[0], "stitching", None, "PO-LHR-0233", 9),
            (rolls_g[1], "stitching", D("70"), "PO-LHR-0233", 4)]
    for roll, dept, meters, ref, days in plan:
        await fs.issue_roll(db, t, u, roll.id, IssueRollRequest(
            issued_to_department=dept, issued_meters=meters, cmt_order_reference=ref, issued_date=ago(days)))

    # ---- imports (LC lifecycle) ---------------------------------------------
    wh = await imps.create_import(db, t, ImportCreate(
        lc_number="MCB-LC-26-0712", shipment_reference="COSU6218841", supplier_id=seaview.id,
        fabric_type="Polyester Peach Skin 75D", quantity_meters=D("6000"), quantity_kg=D("540"),
        currency="USD", fob_cost=D("7800"), exchange_rate=D("279.35"), freight_cost_pkr=D("186000"),
        insurance_cost_pkr=D("21400"), duties_paid_pkr=D("512000"), lc_opened_date=ago(64)))
    await imps.update_import(db, wh.id, ImportUpdate(status="cleared", clearance_date=ago(22)))
    imp_lot = await imps.receive_import(db, t, wh.id, ReceiveImportRequest(
        lot_number="IMP-CN-0712", color="Navy", warehouse_arrival_date=ago(19), roll_count=12,
        location="Import Bay 1"))
    for roll in (await db.execute(select(FabricRoll).where(FabricRoll.lot_id == imp_lot.id))).scalars():
        roll.created_at = datetime.combine(imp_lot.received_date, time(9), tzinfo=timezone.utc)
    await db.flush()

    stuck = await imps.create_import(db, t, ImportCreate(
        lc_number="HBL-LC-26-0803", supplier_id=anatolia.id, fabric_type="Stretch Denim 11oz",
        quantity_meters=D("4500"), currency="USD", fob_cost=D("15750"), exchange_rate=D("280.10"),
        lc_opened_date=ago(52), notes="Vessel rerouted via Jebel Ali"))
    port = await imps.create_import(db, t, ImportCreate(
        lc_number="MCB-LC-26-0829", shipment_reference="MSKU7730214", supplier_id=seaview.id,
        fabric_type="Nylon Taslan 228T", quantity_meters=D("3000"), currency="USD", fob_cost=D("4200"),
        exchange_rate=D("280.40"), freight_cost_pkr=D("98000"), duties_paid_pkr=D("276000"),
        port_of_entry="Karachi", lc_opened_date=ago(35)))
    await imps.update_import(db, port.id, ImportUpdate(status="cleared", clearance_date=ago(10)))
    await imps.create_import(db, t, ImportCreate(
        lc_number="UBL-LC-26-0915", supplier_id=anatolia.id, fabric_type="Rigid Denim 13.5oz",
        quantity_meters=D("3200"), currency="EUR", fob_cost=D("12160"), exchange_rate=D("302.80"),
        lc_opened_date=ago(15)))
    _ = stuck  # kept for readability: this one trips the "import_overdue" rule
