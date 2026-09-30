"""/weaving-sessions and /knitting-sessions."""
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id, get_current_user_id, require_permission
from app.schemas.fabric import (
    KnittingSessionCreate, KnittingSessionRead, KnittingSessionUpdate,
    WeavingSessionCreate, WeavingSessionRead, WeavingSessionUpdate,
)
from app.services import production_service as svc

router = APIRouter(tags=["production"])
READ = [require_permission("fabric_read")]
WRITE = [require_permission("fabric_write")]


@router.get("/weaving-sessions", response_model=list[WeavingSessionRead], dependencies=READ)
async def list_weaving(lot_id: Optional[UUID] = None, loom: Optional[str] = None,
                       date_from: Optional[date] = Query(default=None, alias="from"),
                       date_to: Optional[date] = Query(default=None, alias="to"),
                       limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0),
                       db: AsyncSession = Depends(get_db)):
    return await svc.list_weaving(db, lot_id, loom, date_from, date_to, limit, offset)


@router.post("/weaving-sessions", response_model=WeavingSessionRead, status_code=201, dependencies=WRITE)
async def create_weaving(payload: WeavingSessionCreate, db: AsyncSession = Depends(get_db),
                         tenant_id: str = Depends(get_current_tenant_id),
                         user_id: str = Depends(get_current_user_id)):
    return await svc.create_weaving(db, tenant_id, user_id, payload)


@router.patch("/weaving-sessions/{session_id}", response_model=WeavingSessionRead, dependencies=WRITE)
async def update_weaving(session_id: UUID, payload: WeavingSessionUpdate, db: AsyncSession = Depends(get_db)):
    return await svc.update_weaving(db, session_id, payload)


@router.get("/knitting-sessions", response_model=list[KnittingSessionRead], dependencies=READ)
async def list_knitting(yarn_type_id: Optional[UUID] = None, machine: Optional[str] = None,
                        date_from: Optional[date] = Query(default=None, alias="from"),
                        date_to: Optional[date] = Query(default=None, alias="to"),
                        limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0),
                        db: AsyncSession = Depends(get_db)):
    return await svc.list_knitting(db, yarn_type_id, machine, date_from, date_to, limit, offset)


@router.post("/knitting-sessions", response_model=KnittingSessionRead, status_code=201, dependencies=WRITE)
async def create_knitting(payload: KnittingSessionCreate, db: AsyncSession = Depends(get_db),
                          tenant_id: str = Depends(get_current_tenant_id),
                          user_id: str = Depends(get_current_user_id)):
    return await svc.create_knitting(db, tenant_id, user_id, payload)


@router.patch("/knitting-sessions/{session_id}", response_model=KnittingSessionRead, dependencies=WRITE)
async def update_knitting(session_id: UUID, payload: KnittingSessionUpdate, db: AsyncSession = Depends(get_db)):
    return await svc.update_knitting(db, session_id, payload)
