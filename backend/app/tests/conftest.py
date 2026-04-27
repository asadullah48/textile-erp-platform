"""Shared pytest fixtures: two-tenant async clients."""
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

BASE = "/api/v1"

# Unique run token so repeated test runs don't collide on email uniqueness
_RUN_ID = uuid.uuid4().hex[:8]


def _reg_payload(suffix: str) -> dict:
    return {
        "org_name": f"Test Org {suffix} {_RUN_ID}",
        "industry": "fabric_mill",
        "full_name": f"Owner {suffix}",
        "email": f"owner_{suffix}_{_RUN_ID}@example.com",
        "password": "Test1234!",
    }


@pytest_asyncio.fixture(scope="session")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(scope="session")
async def tenant_a(client: AsyncClient):
    resp = await client.post(f"{BASE}/auth/register-tenant", json=_reg_payload("alpha"))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {"token": data["access_token"], "tenant_id": data["tenant"]["id"]}


@pytest_asyncio.fixture(scope="session")
async def tenant_b(client: AsyncClient):
    resp = await client.post(f"{BASE}/auth/register-tenant", json=_reg_payload("beta"))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {"token": data["access_token"], "tenant_id": data["tenant"]["id"]}


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
