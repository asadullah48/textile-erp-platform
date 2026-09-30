import uuid as _uuid
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from fastapi import Request, HTTPException
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

# Admin engine uses the DB owner role for auth-only operations such as tenant
# registration and login, where no tenant context exists yet. It is NOT assumed
# to bypass RLS: the auth flows set the narrowest context they need
# (app.user_id / app.tenant_id) so they work even when the table owner is
# subject to FORCE ROW LEVEL SECURITY (local dev, CI, Neon's default role).
admin_engine = create_async_engine(settings.effective_admin_url, pool_pre_ping=True)
admin_session_factory = async_sessionmaker(admin_engine, expire_on_commit=False)


def _validated_uuid(value: object, label: str) -> str:
    try:
        return str(_uuid.UUID(str(value)))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {label} context")


async def set_tenant_context(session: AsyncSession, tenant_id: object) -> None:
    """Scope every RLS-protected query in the current transaction to one tenant.

    Uses set_config(..., is_local => true) with a bound parameter — the value
    never reaches SQL text, and it resets automatically at transaction end.
    """
    await session.execute(
        text("SELECT set_config('app.tenant_id', :v, true)"),
        {"v": _validated_uuid(tenant_id, "tenant")},
    )


async def set_user_context(session: AsyncSession, user_id: object) -> None:
    """Allow the current transaction to read this user's own memberships only."""
    await session.execute(
        text("SELECT set_config('app.user_id', :v, true)"),
        {"v": _validated_uuid(user_id, "user")},
    )


async def get_db(request: Request):
    async with async_session_factory() as session:
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            await set_tenant_context(session, tenant_id)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_admin_db():
    """Session for auth-only operations (registration, login, demo workspaces)."""
    async with admin_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
