"""/fabric-imports — LC tracking."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id, require_permission
from app.schemas.fabric import (
    FabricLotRead, ImportCreate, ImportRead, ImportStatus, ImportUpdate, ReceiveImportRequest,
)
from app.services import import_service as svc

router = APIRouter(prefix="/fabric-imports", tags=["fabric-imports"])
READ = [require_permission("fabric_read")]
WRITE = [require_permission("fabric_import_write")]


@router.get("", response_model=list[ImportRead], dependencies=READ)
async def list_imports(status: Optional[ImportStatus] = None, supplier_id: Optional[UUID] = None,
                       limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0),
                       db: AsyncSession = Depends(get_db)):
    return await svc.list_imports(db, status, supplier_id, limit, offset)


@router.post("", response_model=ImportRead, status_code=201, dependencies=WRITE)
async def create_import(payload: ImportCreate, db: AsyncSession = Depends(get_db),
                        tenant_id: str = Depends(get_current_tenant_id)):
    return await svc.create_import(db, tenant_id, payload)


@router.get("/{import_id}", response_model=ImportRead, dependencies=READ)
async def get_import(import_id: UUID, db: AsyncSession = Depends(get_db)):
    return await svc.get_import(db, import_id)


@router.patch("/{import_id}", response_model=ImportRead, dependencies=WRITE)
async def update_import(import_id: UUID, payload: ImportUpdate, db: AsyncSession = Depends(get_db)):
    return await svc.update_import(db, import_id, payload)


@router.post("/{import_id}/receive", response_model=FabricLotRead, status_code=201,
             dependencies=[require_permission("fabric_write"), require_permission("fabric_import_write")])
async def receive_import(import_id: UUID, payload: ReceiveImportRequest, db: AsyncSession = Depends(get_db),
                         tenant_id: str = Depends(get_current_tenant_id)):
    return await svc.receive_import(db, tenant_id, import_id, payload)
