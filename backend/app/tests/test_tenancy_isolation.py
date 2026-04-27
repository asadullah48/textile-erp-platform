"""Tests that RLS prevents cross-tenant data access."""
import pytest
from datetime import date
from httpx import AsyncClient
from app.tests.conftest import auth

BASE = "/api/v1"

LOT_PAYLOAD = {
    "lot_number": "LOT-001",
    "fabric_type": "Cotton",
    "color": "White",
    "total_meters": "500.00",
    "received_date": str(date.today()),
    "status": "in_stock",
}

ROLL_PAYLOAD = {
    "roll_number": "ROLL-001",
    "length_meters": "50.00",
    "status": "available",
}


@pytest.mark.asyncio
async def test_tenant_a_creates_lot_tenant_b_cannot_see_it(
    client: AsyncClient, tenant_a: dict, tenant_b: dict
):
    # A creates a lot
    resp = await client.post(f"{BASE}/fabric-lots", json=LOT_PAYLOAD, headers=auth(tenant_a["token"]))
    assert resp.status_code == 201
    lot_id = resp.json()["id"]

    # B cannot list it
    resp_b = await client.get(f"{BASE}/fabric-lots", headers=auth(tenant_b["token"]))
    ids = [l["id"] for l in resp_b.json()]
    assert lot_id not in ids

    # B cannot get it directly
    resp_direct = await client.get(f"{BASE}/fabric-lots/{lot_id}", headers=auth(tenant_b["token"]))
    assert resp_direct.status_code == 404


@pytest.mark.asyncio
async def test_tenant_b_creates_roll_tenant_a_cannot_access(
    client: AsyncClient, tenant_a: dict, tenant_b: dict
):
    # B creates a lot first
    resp = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "LOT-B-001"},
        headers=auth(tenant_b["token"]),
    )
    assert resp.status_code == 201
    b_lot_id = resp.json()["id"]

    # B adds a roll
    resp_roll = await client.post(
        f"{BASE}/fabric-lots/{b_lot_id}/rolls", json=ROLL_PAYLOAD, headers=auth(tenant_b["token"])
    )
    assert resp_roll.status_code == 201
    roll_id = resp_roll.json()["id"]

    # A cannot see that roll in global list
    resp_a = await client.get(f"{BASE}/fabric-rolls", headers=auth(tenant_a["token"]))
    ids = [r["id"] for r in resp_a.json()]
    assert roll_id not in ids

    # A cannot get the roll directly
    resp_direct = await client.get(f"{BASE}/fabric-rolls/{roll_id}", headers=auth(tenant_a["token"]))
    assert resp_direct.status_code == 404


@pytest.mark.asyncio
async def test_cross_tenant_update_returns_404(
    client: AsyncClient, tenant_a: dict, tenant_b: dict
):
    resp = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "LOT-A-002"},
        headers=auth(tenant_a["token"]),
    )
    assert resp.status_code == 201
    lot_id = resp.json()["id"]

    # B tries to update A's lot
    resp_update = await client.patch(
        f"{BASE}/fabric-lots/{lot_id}",
        json={"status": "fully_consumed"},
        headers=auth(tenant_b["token"]),
    )
    assert resp_update.status_code in (403, 404)


@pytest.mark.asyncio
async def test_cross_tenant_delete_returns_404(
    client: AsyncClient, tenant_a: dict, tenant_b: dict
):
    resp = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "LOT-A-003"},
        headers=auth(tenant_a["token"]),
    )
    assert resp.status_code == 201
    lot_id = resp.json()["id"]

    resp_del = await client.delete(f"{BASE}/fabric-lots/{lot_id}", headers=auth(tenant_b["token"]))
    assert resp_del.status_code in (403, 404)


@pytest.mark.asyncio
async def test_summary_is_tenant_scoped(
    client: AsyncClient, tenant_a: dict, tenant_b: dict
):
    # A creates lot + 2 rolls
    lot_resp = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "LOT-SUMMARY"},
        headers=auth(tenant_a["token"]),
    )
    assert lot_resp.status_code == 201
    lot_id = lot_resp.json()["id"]

    for i in range(2):
        await client.post(
            f"{BASE}/fabric-lots/{lot_id}/rolls",
            json={**ROLL_PAYLOAD, "roll_number": f"R-{i}", "length_meters": "100.00"},
            headers=auth(tenant_a["token"]),
        )

    # A summary shows 2 rolls, 200m
    summary = await client.get(f"{BASE}/fabric-lots/{lot_id}/summary", headers=auth(tenant_a["token"]))
    assert summary.status_code == 200
    data = summary.json()
    assert data["roll_count"] == 2
    assert float(data["total_meters"]) == 200.0

    # B cannot get that summary
    resp_b = await client.get(f"{BASE}/fabric-lots/{lot_id}/summary", headers=auth(tenant_b["token"]))
    assert resp_b.status_code == 404
