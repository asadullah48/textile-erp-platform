"""Coverage for register-tenant / login / me — previously untested."""
import pytest
from httpx import AsyncClient
from app.tests.conftest import auth, _reg_payload

BASE = "/api/v1"


@pytest.mark.asyncio
async def test_register_tenant_returns_token_user_and_tenant(client: AsyncClient):
    resp = await client.post(f"{BASE}/auth/register-tenant", json=_reg_payload("regtest"))
    assert resp.status_code == 200
    data = resp.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["user"]["role"] == "owner"
    assert data["tenant"]["org_name"].startswith("Test Org regtest")
    assert "id" in data["tenant"]


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_400(client: AsyncClient):
    payload = _reg_payload("dupe")
    first = await client.post(f"{BASE}/auth/register-tenant", json=payload)
    assert first.status_code == 200

    second = await client.post(
        f"{BASE}/auth/register-tenant",
        json={**payload, "org_name": "A Different Org"},
    )
    assert second.status_code == 400
    assert "already registered" in second.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_with_correct_credentials_returns_token(client: AsyncClient):
    payload = _reg_payload("loginok")
    reg = await client.post(f"{BASE}/auth/register-tenant", json=payload)
    assert reg.status_code == 200

    login = await client.post(
        f"{BASE}/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]


@pytest.mark.asyncio
async def test_login_with_wrong_password_returns_401(client: AsyncClient):
    payload = _reg_payload("loginbad")
    reg = await client.post(f"{BASE}/auth/register-tenant", json=payload)
    assert reg.status_code == 200

    login = await client.post(
        f"{BASE}/auth/login",
        json={"email": payload["email"], "password": "WrongPassword1!"},
    )
    assert login.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_returns_401(client: AsyncClient):
    login = await client.post(
        f"{BASE}/auth/login",
        json={"email": "does-not-exist@example.com", "password": "Whatever1!"},
    )
    assert login.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth_header(client: AsyncClient):
    resp = await client.get(f"{BASE}/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user_and_tenant(client: AsyncClient, tenant_a: dict):
    resp = await client.get(f"{BASE}/auth/me", headers=auth(tenant_a["token"]))
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "owner"
    assert data["tenant"]["id"] == tenant_a["tenant_id"]


@pytest.mark.asyncio
async def test_register_with_short_password_is_rejected(client: AsyncClient):
    payload = _reg_payload("shortpw")
    payload["password"] = "short"
    resp = await client.post(f"{BASE}/auth/register-tenant", json=payload)
    assert resp.status_code == 422
