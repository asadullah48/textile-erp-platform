"""CRUD lifecycle coverage for fabric lots and rolls — previously untested.

test_tenancy_isolation.py covers cross-tenant isolation; this file covers the
single-tenant happy path and basic validation that isolation tests don't touch.
"""
import uuid
import pytest
from datetime import date
from httpx import AsyncClient
from app.tests.conftest import auth

BASE = "/api/v1"

LOT_PAYLOAD = {
    "lot_number": "CRUD-LOT-001",
    "fabric_type": "Cotton",
    "color": "Indigo",
    "total_meters": "300.00",
    "received_date": str(date.today()),
    "status": "in_stock",
}

ROLL_PAYLOAD = {
    "roll_number": "CRUD-ROLL-001",
    "length_meters": "25.00",
    "status": "available",
}


@pytest.mark.asyncio
async def test_create_lot_returns_201_with_submitted_fields(client: AsyncClient, tenant_a: dict):
    resp = await client.post(f"{BASE}/fabric-lots", json=LOT_PAYLOAD, headers=auth(tenant_a["token"]))
    assert resp.status_code == 201
    data = resp.json()
    assert data["lot_number"] == LOT_PAYLOAD["lot_number"]
    assert data["fabric_type"] == "Cotton"
    assert float(data["total_meters"]) == 300.0
    assert data["status"] == "in_stock"


@pytest.mark.asyncio
async def test_list_lots_includes_created_lot(client: AsyncClient, tenant_a: dict):
    create = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "CRUD-LOT-LIST"},
        headers=auth(tenant_a["token"]),
    )
    assert create.status_code == 201
    lot_id = create.json()["id"]

    listing = await client.get(f"{BASE}/fabric-lots", headers=auth(tenant_a["token"]))
    assert listing.status_code == 200
    assert any(lot["id"] == lot_id for lot in listing.json())


@pytest.mark.asyncio
async def test_get_nonexistent_lot_returns_404(client: AsyncClient, tenant_a: dict):
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"{BASE}/fabric-lots/{fake_id}", headers=auth(tenant_a["token"]))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_lot_status_persists(client: AsyncClient, tenant_a: dict):
    create = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "CRUD-LOT-UPDATE"},
        headers=auth(tenant_a["token"]),
    )
    lot_id = create.json()["id"]

    update = await client.patch(
        f"{BASE}/fabric-lots/{lot_id}",
        json={"status": "fully_consumed"},
        headers=auth(tenant_a["token"]),
    )
    assert update.status_code == 200
    assert update.json()["status"] == "fully_consumed"

    refetch = await client.get(f"{BASE}/fabric-lots/{lot_id}", headers=auth(tenant_a["token"]))
    assert refetch.json()["status"] == "fully_consumed"


@pytest.mark.asyncio
async def test_delete_lot_then_get_returns_404(client: AsyncClient, tenant_a: dict):
    create = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "CRUD-LOT-DELETE"},
        headers=auth(tenant_a["token"]),
    )
    lot_id = create.json()["id"]

    delete = await client.delete(f"{BASE}/fabric-lots/{lot_id}", headers=auth(tenant_a["token"]))
    assert delete.status_code == 204

    refetch = await client.get(f"{BASE}/fabric-lots/{lot_id}", headers=auth(tenant_a["token"]))
    assert refetch.status_code == 404  # soft-deleted: is_deleted=True excludes it from reads


@pytest.mark.asyncio
async def test_add_roll_to_lot_and_delete_roll(client: AsyncClient, tenant_a: dict):
    lot = await client.post(
        f"{BASE}/fabric-lots",
        json={**LOT_PAYLOAD, "lot_number": "CRUD-LOT-ROLLS"},
        headers=auth(tenant_a["token"]),
    )
    lot_id = lot.json()["id"]

    roll = await client.post(
        f"{BASE}/fabric-lots/{lot_id}/rolls", json=ROLL_PAYLOAD, headers=auth(tenant_a["token"])
    )
    assert roll.status_code == 201
    roll_id = roll.json()["id"]
    assert roll.json()["lot_id"] == lot_id

    delete = await client.delete(f"{BASE}/fabric-rolls/{roll_id}", headers=auth(tenant_a["token"]))
    assert delete.status_code == 204

    refetch = await client.get(f"{BASE}/fabric-rolls/{roll_id}", headers=auth(tenant_a["token"]))
    assert refetch.status_code == 404


@pytest.mark.asyncio
async def test_create_lot_missing_required_field_returns_422(client: AsyncClient, tenant_a: dict):
    incomplete = {k: v for k, v in LOT_PAYLOAD.items() if k != "lot_number"}
    resp = await client.post(f"{BASE}/fabric-lots", json=incomplete, headers=auth(tenant_a["token"]))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_fabric_lots_endpoints_require_auth(client: AsyncClient):
    resp = await client.get(f"{BASE}/fabric-lots")
    assert resp.status_code == 401
