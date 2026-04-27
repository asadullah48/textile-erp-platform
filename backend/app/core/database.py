import uuid as _uuid
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from fastapi import Request, HTTPException
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

# Admin engine uses the DB owner role (BYPASSRLS) for auth-only operations such
# as tenant registration and login where no tenant context is available yet.
admin_engine = create_async_engine(settings.effective_admin_url, pool_pre_ping=True)
admin_session_factory = async_sessionmaker(admin_engine, expire_on_commit=False)


async def get_db(request: Request):
    async with async_session_factory() as session:
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            try:
                _uuid.UUID(str(tenant_id))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid tenant context")
            await session.execute(text(f"SET LOCAL app.tenant_id = '{tenant_id}'"))
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_admin_db():
    """Session with BYPASSRLS for auth-only operations (registration, login)."""
    async with admin_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
