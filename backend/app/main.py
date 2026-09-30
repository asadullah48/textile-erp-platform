from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.middleware.tenancy import TenancyMiddleware

DESCRIPTION = """
Multi-tenant Fabric Mill ERP for Pakistan's textile SMEs.

Every tenant-scoped table is protected by PostgreSQL Row-Level Security; each
request transaction is scoped with `set_config('app.tenant_id', …, true)`.
Authenticate with `POST /api/v1/auth/login` (or `POST /api/v1/auth/demo` for an
isolated, pre-seeded demo mill) and send `Authorization: Bearer <token>`.
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="Textile ERP API", version="1.1.0", description=DESCRIPTION, lifespan=lifespan)

app.add_middleware(TenancyMiddleware)
# CORS is added last so it wraps the tenancy middleware: 401s from TenancyMiddleware
# still carry CORS headers, so the browser surfaces them instead of a CORS error.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["ops"])
async def health():
    return {"status": "ok"}


@app.get("/health/ready", tags=["ops"])
async def ready():
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
