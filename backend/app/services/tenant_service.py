from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
from slugify import slugify
from app.models.tenant import Tenant, User, TenantUser
from app.models.subscription import SubscriptionPlan, TenantSubscription
from app.core.security import hash_password, verify_password, create_access_token
from app.schemas.auth import RegisterTenantRequest, LoginRequest


async def register_tenant(db: AsyncSession, payload: RegisterTenantRequest) -> dict:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    slug = payload.slug or slugify(payload.org_name)
    slug_check = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if slug_check.scalar_one_or_none():
        slug = f"{slug}-{payload.email.split('@')[0]}"

    tenant = Tenant(
        org_name=payload.org_name,
        slug=slug,
        industry=payload.industry,
        city=payload.city,
        country=payload.country,
        currency=payload.currency,
    )
    db.add(tenant)
    await db.flush()

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()

    db.add(TenantUser(tenant_id=tenant.id, user_id=user.id, role="owner"))

    free_plan = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.name == "free")
    )
    free_plan = free_plan.scalar_one()
    db.add(TenantSubscription(tenant_id=tenant.id, plan_id=free_plan.id, status="active"))

    await db.flush()

    token = create_access_token({
        "sub": str(user.id),
        "tenant_id": str(tenant.id),
        "role": "owner",
        "plan": "free",
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": "owner"},
        "tenant": {"id": str(tenant.id), "org_name": tenant.org_name, "slug": slug, "currency": tenant.currency},
    }


async def login(db: AsyncSession, payload: LoginRequest) -> dict:
    user_row = await db.execute(
        select(User).where(User.email == payload.email, User.is_active == True)
    )
    user = user_row.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    tenant_user_row = await db.execute(
        select(TenantUser).where(TenantUser.user_id == user.id, TenantUser.is_active == True)
    )
    tenant_user = tenant_user_row.scalar_one_or_none()
    if not tenant_user:
        raise HTTPException(403, "No active tenant membership")

    tenant_row = await db.execute(select(Tenant).where(Tenant.id == tenant_user.tenant_id))
    tenant = tenant_row.scalar_one()

    plan_name = "free"
    sub_row = await db.execute(
        select(TenantSubscription).where(TenantSubscription.tenant_id == tenant.id)
    )
    sub = sub_row.scalar_one_or_none()
    if sub:
        plan_row = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id)
        )
        plan = plan_row.scalar_one_or_none()
        if plan:
            plan_name = plan.name

    token = create_access_token({
        "sub": str(user.id),
        "tenant_id": str(tenant.id),
        "role": tenant_user.role,
        "plan": plan_name,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": tenant_user.role},
        "tenant": {"id": str(tenant.id), "org_name": tenant.org_name, "slug": tenant.slug, "currency": tenant.currency},
    }


async def get_me(db: AsyncSession, user_id: str, tenant_id: str) -> dict:
    user_row = await db.execute(select(User).where(User.id == user_id))
    user = user_row.scalar_one()
    tenant_row = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_row.scalar_one()
    tu_row = await db.execute(
        select(TenantUser).where(
            TenantUser.user_id == user_id,
            TenantUser.tenant_id == tenant_id,
        )
    )
    tu = tu_row.scalar_one()
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": tu.role,
        "tenant": {
            "id": str(tenant.id),
            "org_name": tenant.org_name,
            "slug": tenant.slug,
            "currency": tenant.currency,
        },
    }
