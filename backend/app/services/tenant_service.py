"""Tenant registration, login, current-user lookup and team management.

RLS note: these flows run on the admin session but do NOT rely on the DB role
bypassing RLS. Registration sets app.tenant_id to the tenant it just created
before writing the membership row; login sets app.user_id only *after* the
password check, which unlocks exactly one thing — that user's own memberships
(policy `self_membership`, migration 003).
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import set_tenant_context, set_user_context
from app.core.permissions import permissions_for
from app.core.security import hash_password, verify_password, create_access_token
from app.models.subscription import SubscriptionPlan, TenantSubscription
from app.models.tenant import Tenant, User, TenantUser
from app.schemas.auth import RegisterTenantRequest, LoginRequest, TeamMemberCreate


def _auth_response(user: User, tenant: Tenant, role: str, plan: str) -> dict:
    token = create_access_token({
        "sub": str(user.id),
        "tenant_id": str(tenant.id),
        "role": role,
        "plan": plan,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": role},
        "tenant": _tenant_out(tenant),
    }


def _tenant_out(tenant: Tenant) -> dict:
    return {
        "id": str(tenant.id),
        "org_name": tenant.org_name,
        "slug": tenant.slug,
        "currency": tenant.currency,
        "industry": tenant.industry,
        "is_demo": bool(tenant.is_demo),
    }


async def _unique_slug(db: AsyncSession, base: str) -> str:
    base = slugify(base)[:80] or "workspace"
    slug, n = base, 1
    while (await db.execute(select(Tenant.id).where(Tenant.slug == slug))).first():
        n += 1
        slug = f"{base}-{n}"
    return slug


async def create_tenant_with_owner(
    db: AsyncSession,
    *,
    org_name: str,
    industry: str,
    full_name: str,
    email: str,
    password: str,
    slug: str | None = None,
    city: str | None = None,
    country: str = "PK",
    currency: str = "PKR",
    is_demo: bool = False,
) -> tuple[Tenant, User]:
    existing = await db.execute(select(User.id).where(User.email == email))
    if existing.first():
        raise HTTPException(400, "Email already registered")

    tenant = Tenant(
        org_name=org_name,
        slug=await _unique_slug(db, slug or org_name),
        industry=industry,
        city=city,
        country=country,
        currency=currency,
        is_demo=is_demo,
    )
    db.add(tenant)
    user = User(email=email, full_name=full_name, hashed_password=hash_password(password))
    db.add(user)
    await db.flush()

    # tenant_users is RLS-protected: scope this transaction to the new tenant
    # before inserting the owner's membership.
    await set_tenant_context(db, tenant.id)
    db.add(TenantUser(tenant_id=tenant.id, user_id=user.id, role="owner"))

    free_plan = (
        await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "free"))
    ).scalar_one()
    db.add(TenantSubscription(tenant_id=tenant.id, plan_id=free_plan.id, status="active"))
    await db.flush()
    return tenant, user


async def register_tenant(db: AsyncSession, payload: RegisterTenantRequest) -> dict:
    tenant, user = await create_tenant_with_owner(
        db,
        org_name=payload.org_name,
        industry=payload.industry,
        full_name=payload.full_name,
        email=payload.email,
        password=payload.password,
        slug=payload.slug,
        city=payload.city,
        country=payload.country,
        currency=payload.currency,
    )
    return _auth_response(user, tenant, "owner", "free")


async def _plan_name(db: AsyncSession, tenant_id: UUID) -> str:
    row = await db.execute(
        select(SubscriptionPlan.name)
        .join(TenantSubscription, TenantSubscription.plan_id == SubscriptionPlan.id)
        .where(TenantSubscription.tenant_id == tenant_id)
        .order_by(TenantSubscription.created_at.desc())
        .limit(1)
    )
    return row.scalar_one_or_none() or "free"


async def login(db: AsyncSession, payload: LoginRequest) -> dict:
    user = (
        await db.execute(select(User).where(User.email == payload.email, User.is_active == True))  # noqa: E712
    ).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    # Password verified — now (and only now) may this transaction see the
    # user's own membership rows.
    await set_user_context(db, user.id)
    tenant_user = (
        await db.execute(
            select(TenantUser)
            .where(TenantUser.user_id == user.id, TenantUser.is_active == True)  # noqa: E712
            .order_by(TenantUser.created_at)
            .limit(1)
        )
    ).scalar_one_or_none()
    if not tenant_user:
        raise HTTPException(403, "No active tenant membership")

    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_user.tenant_id))).scalar_one()
    if not tenant.is_active:
        raise HTTPException(403, "Workspace is deactivated")
    return _auth_response(user, tenant, tenant_user.role, await _plan_name(db, tenant.id))


async def get_me(db: AsyncSession, user_id: str, tenant_id: str) -> dict:
    user = (await db.execute(select(User).where(User.id == UUID(user_id)))).scalar_one_or_none()
    tenant = (await db.execute(select(Tenant).where(Tenant.id == UUID(tenant_id)))).scalar_one_or_none()
    tu = (
        await db.execute(
            select(TenantUser).where(
                TenantUser.user_id == UUID(user_id),
                TenantUser.tenant_id == UUID(tenant_id),
                TenantUser.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not user or not tenant or not tu:
        raise HTTPException(401, "Session no longer valid")
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": tu.role,
        "permissions": permissions_for(tu.role),
        "tenant": _tenant_out(tenant),
    }


# --------------------------------------------------------------------------- team

async def list_members(db: AsyncSession) -> list[dict]:
    rows = await db.execute(
        select(TenantUser, User)
        .join(User, User.id == TenantUser.user_id)
        .order_by(TenantUser.created_at)
    )
    return [
        {
            "id": str(tu.id),
            "user_id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": tu.role,
            "is_active": bool(tu.is_active),
            "created_at": tu.created_at,
        }
        for tu, u in rows.all()
    ]


async def add_member(db: AsyncSession, tenant_id: str, payload: TeamMemberCreate) -> dict:
    if (await db.execute(select(User.id).where(User.email == payload.email))).first():
        raise HTTPException(409, "A user with this email already exists")
    user = User(email=payload.email, full_name=payload.full_name, hashed_password=hash_password(payload.password))
    db.add(user)
    await db.flush()
    tu = TenantUser(tenant_id=UUID(tenant_id), user_id=user.id, role=payload.role)
    db.add(tu)
    await db.flush()
    return {
        "id": str(tu.id),
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": tu.role,
        "is_active": True,
        "created_at": tu.created_at or datetime.now(timezone.utc),
    }


# --------------------------------------------------------------------------- demo

DEMO_TTL = timedelta(hours=24)


async def purge_expired_demo_tenants(db: AsyncSession) -> int:
    """Delete demo workspaces older than DEMO_TTL (and their users).

    Tenant-scoped rows go via ON DELETE CASCADE; users are global, so their ids
    are collected under each demo tenant's own RLS context first.
    """
    cutoff = datetime.now(timezone.utc) - DEMO_TTL
    expired = (
        await db.execute(select(Tenant.id).where(Tenant.is_demo == True, Tenant.created_at < cutoff))  # noqa: E712
    ).scalars().all()
    from sqlalchemy import delete
    from app.models import fabric as f

    for tid in expired:
        await set_tenant_context(db, tid)
        user_ids = (await db.execute(select(TenantUser.user_id))).scalars().all()
        # Children before parents: FKs between tenant tables are not ON DELETE CASCADE.
        for model in (f.KnittingSession, f.WeavingSession, f.YarnTransaction, f.FabricIssuance,
                      f.FabricRoll, f.FabricLot, f.YarnType, f.FabricImport, f.FabricSupplier):
            await db.execute(delete(model))
        await db.execute(delete(TenantUser))
        await db.execute(delete(TenantSubscription).where(TenantSubscription.tenant_id == tid))
        await db.execute(delete(Tenant).where(Tenant.id == tid))
        if user_ids:
            await db.execute(delete(User).where(User.id.in_(user_ids)))
    return len(expired)


async def create_demo_workspace(db: AsyncSession, max_live: int) -> dict:
    import secrets
    from sqlalchemy import func
    from app.services.demo_seed import seed_demo_data

    await purge_expired_demo_tenants(db)
    live = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.is_demo == True))).scalar_one()  # noqa: E712
    if live >= max_live:
        raise HTTPException(429, "Demo capacity reached — please try again later")

    token = secrets.token_hex(4)
    tenant, user = await create_tenant_with_owner(
        db,
        org_name=f"Demo Weaving Mills {token.upper()}",
        industry="fabric_mill",
        full_name="Demo Owner",
        email=f"demo-{token}@demo.textile-erp.dev",
        password=secrets.token_urlsafe(24),  # never shown; demo access is token-only
        city="Faisalabad",
        is_demo=True,
    )
    await seed_demo_data(db, tenant.id, user.id)
    return _auth_response(user, tenant, "owner", "free")
