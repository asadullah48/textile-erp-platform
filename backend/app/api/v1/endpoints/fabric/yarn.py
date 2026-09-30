"""/yarn-types and their stock ledger."""
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id, get_current_user_id, require_permission
from app.schemas.fabric import (
    YarnTransactionCreate, YarnTransactionRead, YarnTypeCreate, YarnTypeRead, YarnTypeUpdate,
)
from app.services import production_service as svc
from app.services.fabric_service import get_or_404
from app.models.fabric import YarnType

router = APIRouter(prefix="/yarn-types", tags=["yarn"])
READ = [require_permission("fabric_read")]
WRITE = [require_permission("fabric_write")]


@router.get("", response_model=list[YarnTypeRead], dependencies=READ)
async def list_yarn_types(fiber_type: Optional[str] = None, low_stock: bool = False,
                          limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0),
                          db: AsyncSession = Depends(get_db)):
    return await svc.list_yarn_types(db, fiber_type, low_stock, limit, offset)


@router.post("", response_model=YarnTypeRead, status_code=201, dependencies=WRITE)
async def create_yarn_type(payload: YarnTypeCreate, db: AsyncSession = Depends(get_db),
                           tenant_id: str = Depends(get_current_tenant_id),
                           user_id: str = Depends(get_current_user_id)):
    return await svc.create_yarn_type(db, tenant_id, user_id, payload)


@router.get("/{yarn_id}", response_model=YarnTypeRead, dependencies=READ)
async def get_yarn_type(yarn_id: UUID, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, YarnType, yarn_id, "Yarn type")


@router.patch("/{yarn_id}", response_model=YarnTypeRead, dependencies=WRITE)
async def update_yarn_type(yarn_id: UUID, payload: YarnTypeUpdate, db: AsyncSession = Depends(get_db)):
    return await svc.update_yarn_type(db, yarn_id, payload)


@router.delete("/{yarn_id}", status_code=204, dependencies=[require_permission("fabric_delete")])
async def delete_yarn_type(yarn_id: UUID, db: AsyncSession = Depends(get_db)):
    await svc.delete_yarn_type(db, yarn_id)


@router.post("/{yarn_id}/transactions", response_model=YarnTransactionRead, status_code=201, dependencies=WRITE)
async def post_transaction(yarn_id: UUID, payload: YarnTransactionCreate, db: AsyncSession = Depends(get_db),
                           tenant_id: str = Depends(get_current_tenant_id),
                           user_id: str = Depends(get_current_user_id)):
    return await svc.post_transaction(db, tenant_id, user_id, yarn_id, payload)


@router.get("/{yarn_id}/transactions", response_model=list[YarnTransactionRead], dependencies=READ)
async def list_transactions(yarn_id: UUID, date_from: Optional[date] = Query(default=None, alias="from"),
                            date_to: Optional[date] = Query(default=None, alias="to"),
                            limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0),
                            db: AsyncSession = Depends(get_db)):
    return await svc.list_transactions(db, yarn_id, date_from, date_to, limit, offset)
