"""Module 1 coverage: suppliers, imports, yarn ledger, production, issuance,
reports, Mill Pulse, traceability, RBAC, demo workspaces and RLS at the DB layer."""
import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.database import async_session_factory, set_tenant_context
from app.services.import_service import landed_cost
from app.tests.conftest import auth

BASE = "/api/v1"
RUN = uuid.uuid4().hex[:6]


def u(s: str) -> str:
    """Unique-per-run identifier so repeated runs never collide."""
    return f"{s}-{RUN}"


async def _supplier(client, token, name="Chenab Yarn") -> dict:
    r = await client.post(f"{BASE}/fabric-suppliers", json={"name": u(name), "city": "Faisalabad"},
                          headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _lot_with_rolls(client, token, n=3, length="100", cost="300") -> tuple[dict, list[dict]]:
    lot = await client.post(f"{BASE}/fabric-lots", headers=auth(token), json={
        "lot_number": u(f"LOT{uuid.uuid4().hex[:4]}"), "fabric_type": "Poplin", "color": "Greige",
        "total_meters": str(int(length) * n), "received_date": str(date.today()), "cost_per_meter": cost,
    })
    assert lot.status_code == 201, lot.text
    lot = lot.json()
    rolls = await client.post(f"{BASE}/fabric-lots/{lot['id']}/rolls/bulk", headers=auth(token), json={
        "prefix": u(f"R{uuid.uuid4().hex[:4]}-"), "count": n, "length_meters": length,
    })
    assert rolls.status_code == 201, rolls.text
    return lot, rolls.json()


async def _yarn(client, token, opening="1000", reorder="200") -> dict:
    r = await client.post(f"{BASE}/yarn-types", headers=auth(token), json={
        "yarn_count": "20/1", "fiber_type": "cotton", "unit_cost_per_kg": "900",
        "reorder_level_kg": reorder, "opening_stock_kg": opening,
    })
    assert r.status_code == 201, r.text
    return r.json()


# --------------------------------------------------------------------------- lots / rolls

async def test_bulk_rolls_move_pending_lot_to_in_stock(client: AsyncClient, tenant_a):
    lot, rolls = await _lot_with_rolls(client, tenant_a["token"], n=5)
    assert len(rolls) == 5 and rolls[0]["remaining_meters"] == "100.00"
    got = await client.get(f"{BASE}/fabric-lots/{lot['id']}", headers=auth(tenant_a["token"]))
    assert got.json()["status"] == "in_stock"


async def test_duplicate_lot_number_is_409(client, tenant_a):
    lot, _ = await _lot_with_rolls(client, tenant_a["token"], n=1)
    dup = await client.post(f"{BASE}/fabric-lots", headers=auth(tenant_a["token"]), json={
        "lot_number": lot["lot_number"], "fabric_type": "x", "color": "y",
        "total_meters": "1", "received_date": str(date.today())})
    assert dup.status_code == 409


# --------------------------------------------------------------------------- issuance

async def test_partial_then_full_issue_drives_roll_and_lot_status(client, tenant_a):
    t = tenant_a["token"]
    lot, rolls = await _lot_with_rolls(client, t, n=2)
    r0 = rolls[0]["id"]

    part = await client.post(f"{BASE}/fabric-rolls/{r0}/issue", headers=auth(t),
                             json={"issued_to_department": "cutting", "issued_meters": "40"})
    assert part.status_code == 201, part.text
    roll = (await client.get(f"{BASE}/fabric-rolls/{r0}", headers=auth(t))).json()
    assert roll["status"] == "issued" and roll["remaining_meters"] == "60.00"
    assert (await client.get(f"{BASE}/fabric-lots/{lot['id']}", headers=auth(t))).json()["status"] == "partially_consumed"

    over = await client.post(f"{BASE}/fabric-rolls/{r0}/issue", headers=auth(t),
                             json={"issued_to_department": "cutting", "issued_meters": "60.01"})
    assert over.status_code == 409

    for rid in (r0, rolls[1]["id"]):  # issue everything that remains
        full = await client.post(f"{BASE}/fabric-rolls/{rid}/issue", headers=auth(t),
                                 json={"issued_to_department": "stitching"})
        assert full.status_code == 201
    assert (await client.get(f"{BASE}/fabric-rolls/{r0}", headers=auth(t))).json()["status"] == "consumed"
    assert (await client.get(f"{BASE}/fabric-lots/{lot['id']}", headers=auth(t))).json()["status"] == "fully_consumed"

    summary = (await client.get(f"{BASE}/fabric-lots/{lot['id']}/summary", headers=auth(t))).json()
    assert Decimal(summary["meters_issued"]) == Decimal("200")

    # Issued rolls are part of the production record
    assert (await client.delete(f"{BASE}/fabric-rolls/{r0}", headers=auth(t))).status_code == 409
    assert (await client.delete(f"{BASE}/fabric-lots/{lot['id']}", headers=auth(t))).status_code == 409


async def test_concurrent_issues_cannot_over_issue_a_roll(client, tenant_a):
    """Two supervisors issue 60 m of the same 100 m roll at the same instant.
    SELECT … FOR UPDATE must serialise them: exactly one succeeds."""
    t = tenant_a["token"]
    _, rolls = await _lot_with_rolls(client, t, n=1)
    rid = rolls[0]["id"]
    body = {"issued_to_department": "cutting", "issued_meters": "60"}
    results = await asyncio.gather(*[
        client.post(f"{BASE}/fabric-rolls/{rid}/issue", headers=auth(t), json=body) for _ in range(2)
    ])
    assert sorted(r.status_code for r in results) == [201, 409]
    roll = (await client.get(f"{BASE}/fabric-rolls/{rid}", headers=auth(t))).json()
    assert roll["issued_meters"] == "60.00"


async def test_reserved_roll_requires_order_reference(client, tenant_a):
    t = tenant_a["token"]
    _, rolls = await _lot_with_rolls(client, t, n=1)
    rid = rolls[0]["id"]
    await client.patch(f"{BASE}/fabric-rolls/{rid}", headers=auth(t), json={"status": "reserved"})
    no_ref = await client.post(f"{BASE}/fabric-rolls/{rid}/issue", headers=auth(t),
                               json={"issued_to_department": "cutting"})
    assert no_ref.status_code == 409
    ok = await client.post(f"{BASE}/fabric-rolls/{rid}/issue", headers=auth(t),
                           json={"issued_to_department": "cutting", "cmt_order_reference": "PO-1"})
    assert ok.status_code == 201


# --------------------------------------------------------------------------- yarn ledger

async def test_yarn_ledger_balances_and_blocks_negative_stock(client, tenant_a):
    t = tenant_a["token"]
    y = await _yarn(client, t, opening="100")
    yid = y["id"]
    assert Decimal(y["current_stock_kg"]) == 100

    rec = await client.post(f"{BASE}/yarn-types/{yid}/transactions", headers=auth(t),
                            json={"transaction_type": "receipt", "quantity_kg": "50", "unit_cost": "950"})
    assert rec.status_code == 201 and Decimal(rec.json()["balance_after_kg"]) == 150

    iss = await client.post(f"{BASE}/yarn-types/{yid}/transactions", headers=auth(t),
                            json={"transaction_type": "issue", "quantity_kg": "150.001"})
    assert iss.status_code == 409  # more than on hand

    bad = await client.post(f"{BASE}/yarn-types/{yid}/transactions", headers=auth(t),
                            json={"transaction_type": "receipt", "quantity_kg": "1", "direction": "out"})
    assert bad.status_code == 422  # receipt is always 'in'

    adj = await client.post(f"{BASE}/yarn-types/{yid}/transactions", headers=auth(t),
                            json={"transaction_type": "adjustment", "direction": "out", "quantity_kg": "10"})
    assert adj.status_code == 201

    y2 = (await client.get(f"{BASE}/yarn-types/{yid}", headers=auth(t))).json()
    assert Decimal(y2["current_stock_kg"]) == 140
    assert Decimal(y2["unit_cost_per_kg"]) == 950  # receipt at a new price updates standard cost

    ledger = (await client.get(f"{BASE}/yarn-types/{yid}/transactions", headers=auth(t))).json()
    assert [Decimal(x["balance_after_kg"]) for x in ledger] == [140, 150, 100]  # newest first

    # stock can't be edited directly
    await client.patch(f"{BASE}/yarn-types/{yid}", headers=auth(t), json={"current_stock_kg": "9999"})
    assert Decimal((await client.get(f"{BASE}/yarn-types/{yid}", headers=auth(t))).json()["current_stock_kg"]) == 140


async def test_weaving_session_posts_yarn_issue_atomically(client, tenant_a):
    t = tenant_a["token"]
    lot, _ = await _lot_with_rolls(client, t, n=1)
    y = await _yarn(client, t, opening="100")

    ok = await client.post(f"{BASE}/weaving-sessions", headers=auth(t), json={
        "lot_id": lot["id"], "loom_number": "L-01", "session_date": str(date.today()),
        "produced_meters": "400", "yarn_type_id": y["id"], "yarn_consumed_kg": "30"})
    assert ok.status_code == 201, ok.text
    assert ok.json()["yarn_transaction_id"]
    ledger = (await client.get(f"{BASE}/yarn-types/{y['id']}/transactions", headers=auth(t))).json()
    assert ledger[0]["source"] == "weaving" and ledger[0]["lot_reference"] == lot["lot_number"]

    # Not enough yarn → the whole session is rejected, nothing half-written
    before = len((await client.get(f"{BASE}/weaving-sessions?lot_id={lot['id']}", headers=auth(t))).json())
    fail = await client.post(f"{BASE}/weaving-sessions", headers=auth(t), json={
        "lot_id": lot["id"], "loom_number": "L-01", "session_date": str(date.today()),
        "produced_meters": "400", "yarn_type_id": y["id"], "yarn_consumed_kg": "71"})
    assert fail.status_code == 409
    after = len((await client.get(f"{BASE}/weaving-sessions?lot_id={lot['id']}", headers=auth(t))).json())
    assert before == after
    assert Decimal((await client.get(f"{BASE}/yarn-types/{y['id']}", headers=auth(t))).json()["current_stock_kg"]) == 70


async def test_knitting_session_consumes_yarn(client, tenant_a):
    t = tenant_a["token"]
    y = await _yarn(client, t, opening="500")
    r = await client.post(f"{BASE}/knitting-sessions", headers=auth(t), json={
        "yarn_type_id": y["id"], "machine_number": "KM-1", "session_date": str(date.today()),
        "produced_kg": "200", "yarn_consumed_kg": "208"})
    assert r.status_code == 201, r.text
    assert Decimal((await client.get(f"{BASE}/yarn-types/{y['id']}", headers=auth(t))).json()["current_stock_kg"]) == 292


# --------------------------------------------------------------------------- imports

def test_landed_cost_formula():
    total, per_m = landed_cost(Decimal("7800"), Decimal("279.35"), Decimal("186000"),
                               Decimal("21400"), Decimal("512000"), Decimal("6000"))
    # 7800 × 279.35 = 2,178,930 + 186,000 + 21,400 + 512,000
    assert total == Decimal("2898330.00")
    assert per_m == Decimal("483.0550")


async def test_import_lifecycle_receive_opens_valued_lot(client, tenant_a):
    t = tenant_a["token"]
    s = await _supplier(client, t, "Seaview")
    lc = u("LC")
    created = await client.post(f"{BASE}/fabric-imports", headers=auth(t), json={
        "lc_number": lc, "supplier_id": s["id"], "fabric_type": "Peach Skin", "quantity_meters": "1000",
        "currency": "USD", "fob_cost": "1000", "exchange_rate": "280", "duties_paid_pkr": "20000",
        "lc_opened_date": str(date.today() - timedelta(days=30)),
        "total_landed_cost_pkr": "1",  # ignored: server computes it
    })
    assert created.status_code == 201, created.text
    imp = created.json()
    assert imp["total_landed_cost_pkr"] == "300000.00" and imp["landed_cost_per_meter_pkr"] == "300.0000"

    dup = await client.post(f"{BASE}/fabric-imports", headers=auth(t), json={
        "lc_number": lc, "supplier_id": s["id"], "fabric_type": "x", "quantity_meters": "1",
        "currency": "USD", "fob_cost": "1", "exchange_rate": "1", "lc_opened_date": str(date.today())})
    assert dup.status_code == 409

    upd = await client.patch(f"{BASE}/fabric-imports/{imp['id']}", headers=auth(t),
                             json={"status": "cleared", "freight_cost_pkr": "10000"})
    assert upd.status_code == 200
    assert upd.json()["clearance_date"] == str(date.today())
    assert upd.json()["total_landed_cost_pkr"] == "310000.00"

    back = await client.patch(f"{BASE}/fabric-imports/{imp['id']}", headers=auth(t), json={"status": "in_transit"})
    assert back.status_code == 409

    lot = await client.post(f"{BASE}/fabric-imports/{imp['id']}/receive", headers=auth(t),
                            json={"lot_number": u("IMP"), "roll_count": 3})
    assert lot.status_code == 201, lot.text
    lot = lot.json()
    assert lot["fabric_category"] == "imported" and lot["import_id"] == imp["id"]
    assert lot["cost_per_meter"] == "310.0000"
    rolls = (await client.get(f"{BASE}/fabric-lots/{lot['id']}/rolls", headers=auth(t))).json()
    assert sum(Decimal(r["length_meters"]) for r in rolls) == Decimal("1000")  # rounding absorbed

    again = await client.post(f"{BASE}/fabric-imports/{imp['id']}/receive", headers=auth(t),
                              json={"lot_number": u("IMP2")})
    assert again.status_code == 409
    locked = await client.patch(f"{BASE}/fabric-imports/{imp['id']}", headers=auth(t), json={"duties_paid_pkr": "1"})
    assert locked.status_code == 409

    trace = await client.get(f"{BASE}/fabric-rolls/{rolls[0]['id']}/trace", headers=auth(t))
    assert trace.status_code == 200
    kinds = [e["kind"] for e in trace.json()["timeline"]]
    assert kinds[0] == "import" and "lot" in kinds and "roll" in kinds
    assert trace.json()["supplier"]["id"] == s["id"]


# --------------------------------------------------------------------------- suppliers

async def test_supplier_detail_stats_and_delete_guard(client, tenant_a):
    t = tenant_a["token"]
    s = await _supplier(client, t, "Lyallpur")
    await client.post(f"{BASE}/fabric-lots", headers=auth(t), json={
        "lot_number": u("SUPLOT"), "fabric_type": "Twill", "color": "Natural", "total_meters": "500",
        "received_date": str(date.today()), "supplier_id": s["id"], "cost_per_meter": "400"})
    d = (await client.get(f"{BASE}/fabric-suppliers/{s['id']}", headers=auth(t))).json()
    assert d["stats"]["lots_received"] == 1 and d["stats"]["purchase_value_pkr"] == "200000.00"
    assert (await client.delete(f"{BASE}/fabric-suppliers/{s['id']}", headers=auth(t))).status_code == 409


# --------------------------------------------------------------------------- reports

async def test_reports_endpoints_respond(client, tenant_a):
    t = tenant_a["token"]
    for path in ("inventory-summary", "consumption", "production", "low-stock", "insights"):
        r = await client.get(f"{BASE}/fabric-reports/{path}", headers=auth(t))
        assert r.status_code == 200, (path, r.text)
    csv = await client.get(f"{BASE}/fabric-reports/stock.csv", headers=auth(t))
    assert csv.status_code == 200 and csv.text.startswith("lot_number,")
    bad = await client.get(f"{BASE}/fabric-reports/consumption?from=2026-02-01&to=2026-01-01", headers=auth(t))
    assert bad.status_code == 422


# --------------------------------------------------------------------------- RBAC

async def _member(client, owner_token, role) -> str:
    email = f"{role}-{uuid.uuid4().hex[:8]}@example.com"
    r = await client.post(f"{BASE}/team/members", headers=auth(owner_token), json={
        "full_name": f"Test {role}", "email": email, "role": role, "password": "Passw0rd!"})
    assert r.status_code == 201, r.text
    login = await client.post(f"{BASE}/auth/login", json={"email": email, "password": "Passw0rd!"})
    assert login.status_code == 200, login.text
    assert login.json()["user"]["role"] == role
    return login.json()["access_token"]


async def test_accountant_reads_but_cannot_write_fabric(client, tenant_a):
    acct = await _member(client, tenant_a["token"], "accountant")
    assert (await client.get(f"{BASE}/fabric-lots", headers=auth(acct))).status_code == 200
    w = await client.post(f"{BASE}/fabric-lots", headers=auth(acct), json={
        "lot_number": u("ACCT"), "fabric_type": "x", "color": "y", "total_meters": "1",
        "received_date": str(date.today())})
    assert w.status_code == 403
    me = (await client.get(f"{BASE}/auth/me", headers=auth(acct))).json()
    assert "fabric_write" not in me["permissions"] and "fabric_import_write" in me["permissions"]


async def test_operator_can_write_but_not_delete_or_manage_team(client, tenant_a):
    op = await _member(client, tenant_a["token"], "operator")
    lot, _ = await _lot_with_rolls(client, op, n=1)
    assert (await client.delete(f"{BASE}/fabric-lots/{lot['id']}", headers=auth(op))).status_code == 403
    assert (await client.get(f"{BASE}/team/members", headers=auth(op))).status_code == 403
    add = await client.post(f"{BASE}/team/members", headers=auth(op), json={
        "full_name": "x y", "email": f"x{RUN}@example.com", "role": "manager", "password": "Passw0rd!"})
    assert add.status_code == 403


async def test_team_members_are_tenant_scoped(client, tenant_a, tenant_b):
    await _member(client, tenant_a["token"], "manager")
    a = {m["email"] for m in (await client.get(f"{BASE}/team/members", headers=auth(tenant_a["token"]))).json()}
    b = {m["email"] for m in (await client.get(f"{BASE}/team/members", headers=auth(tenant_b["token"]))).json()}
    assert a and b and not (a & b)


# --------------------------------------------------------------------------- isolation

async def test_new_module_resources_are_invisible_across_tenants(client, tenant_a, tenant_b):
    ta, tb = tenant_a["token"], tenant_b["token"]
    s = await _supplier(client, ta, "Private")
    y = await _yarn(client, ta)
    _, rolls = await _lot_with_rolls(client, ta, n=1)

    for path in (f"fabric-suppliers/{s['id']}", f"yarn-types/{y['id']}", f"fabric-rolls/{rolls[0]['id']}/trace"):
        assert (await client.get(f"{BASE}/{path}", headers=auth(tb))).status_code == 404, path
    issue = await client.post(f"{BASE}/fabric-rolls/{rolls[0]['id']}/issue", headers=auth(tb),
                              json={"issued_to_department": "cutting"})
    assert issue.status_code == 404
    txn = await client.post(f"{BASE}/yarn-types/{y['id']}/transactions", headers=auth(tb),
                            json={"transaction_type": "issue", "quantity_kg": "1"})
    assert txn.status_code == 404
    names = [x["name"] for x in (await client.get(f"{BASE}/fabric-suppliers", headers=auth(tb))).json()]
    assert s["name"] not in names


async def test_rls_blocks_raw_sql_without_where_clause(tenant_a, tenant_b, client):
    """The guarantee under the API: even a query with no tenant filter at all,
    run as the application role, only sees the scoped tenant's rows."""
    await _supplier(client, tenant_a["token"], "RawSQL")
    async with async_session_factory() as s:
        await set_tenant_context(s, tenant_b["tenant_id"])
        seen = (await s.execute(text("SELECT DISTINCT tenant_id FROM fabric_suppliers"))).scalars().all()
        assert all(str(x) == tenant_b["tenant_id"] for x in seen)
        # Writing a row for another tenant is rejected by WITH CHECK
        with pytest.raises(Exception, match="row-level security"):
            await s.execute(text(
                "INSERT INTO fabric_suppliers (id, tenant_id, name, country) VALUES (gen_random_uuid(), :t, 'x', 'PK')"
            ), {"t": tenant_a["tenant_id"]})
        await s.rollback()
    async with async_session_factory() as s:  # no context at all → zero rows, not an error
        assert (await s.execute(text("SELECT count(*) FROM fabric_suppliers"))).scalar_one() == 0


# --------------------------------------------------------------------------- demo

async def test_demo_workspace_is_seeded_isolated_and_pulses(client, tenant_a):
    r = await client.post(f"{BASE}/auth/demo")
    assert r.status_code == 201, r.text
    demo = r.json()
    assert demo["tenant"]["is_demo"] is True
    t = demo["access_token"]

    lots = (await client.get(f"{BASE}/fabric-lots", headers=auth(t))).json()
    assert len(lots) >= 6
    # demo data never leaks into a real tenant, and vice versa
    a_ids = {x["id"] for x in (await client.get(f"{BASE}/fabric-lots", headers=auth(tenant_a["token"]))).json()}
    assert not a_ids & {x["id"] for x in lots}

    pulse = (await client.get(f"{BASE}/fabric-reports/insights", headers=auth(t))).json()
    rules = {i["rule"] for i in pulse["insights"]}
    assert {"dead_stock", "import_overdue", "port_dwell", "loom_quality",
            "yarn_below_reorder", "yarn_runway", "unvalued_stock"} <= rules
    for i in pulse["insights"]:
        assert i["evidence"], i  # every alert carries the numbers that fired it

    inv = (await client.get(f"{BASE}/fabric-reports/inventory-summary", headers=auth(t))).json()
    assert Decimal(inv["total_value_pkr"]) > 0 and Decimal(inv["unvalued_meters"]) == Decimal("600")

    # Seeded yarn balances equal their own ledgers
    for y in (await client.get(f"{BASE}/yarn-types", headers=auth(t))).json():
        ledger = (await client.get(f"{BASE}/yarn-types/{y['id']}/transactions", headers=auth(t))).json()
        assert ledger[0]["balance_after_kg"] == y["current_stock_kg"]


async def test_expired_demo_workspaces_are_purged(client):
    from app.core.database import admin_session_factory
    from app.services.tenant_service import purge_expired_demo_tenants

    demo = (await client.post(f"{BASE}/auth/demo")).json()
    async with admin_session_factory() as s:
        await s.execute(text("UPDATE tenants SET created_at = now() - interval '2 days' WHERE id = :t"),
                        {"t": demo["tenant"]["id"]})
        await s.commit()
    async with admin_session_factory() as s:
        assert await purge_expired_demo_tenants(s) >= 1
        await s.commit()
    async with admin_session_factory() as s:
        left = (await s.execute(text("SELECT count(*) FROM tenants WHERE id = :t"),
                                {"t": demo["tenant"]["id"]})).scalar_one()
        users = (await s.execute(text("SELECT count(*) FROM users WHERE email = :e"),
                                 {"e": demo["user"]["email"]})).scalar_one()
    assert left == 0 and users == 0
    assert (await client.get(f"{BASE}/auth/me", headers=auth(demo["access_token"]))).status_code == 401
