"""/fabric-suppliers."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id, require_permission
from app.schemas.fabric import SupplierCreate, SupplierDetail, SupplierRead, SupplierUpdate
from app.services import fabric_service as svc

router = APIRouter(prefix="/fabric-suppliers", tags=["fabric-suppliers"])
READ = [require_permission("fabric_read")]
WRITE = [require_permission("fabric_supplier_write")]


@router.get("", response_model=list[SupplierRead], dependencies=READ)
async def list_suppliers(search: Optional[str] = Query(default=None, max_length=100),
                         limit: int = Query(default=200, ge=1, le=500), offset: int = Query(default=0, ge=0),
                         db: AsyncSession = Depends(get_db)):
    return await svc.list_suppliers(db, search, limit, offset)


@router.post("", response_model=SupplierRead, status_code=201, dependencies=WRITE)
async def create_supplier(payload: SupplierCreate, db: AsyncSession = Depends(get_db),
                          tenant_id: str = Depends(get_current_tenant_id)):
    return await svc.create_supplier(db, tenant_id, payload)


@router.get("/{supplier_id}", response_model=SupplierDetail, dependencies=READ)
async def get_supplier(supplier_id: UUID, db: AsyncSession = Depends(get_db)):
    return await svc.supplier_detail(db, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierRead, dependencies=WRITE)
async def update_supplier(supplier_id: UUID, payload: SupplierUpdate, db: AsyncSession = Depends(get_db)):
    return await svc.update_supplier(db, supplier_id, payload)


@router.delete("/{supplier_id}", status_code=204, dependencies=[require_permission("fabric_delete")])
async def delete_supplier(supplier_id: UUID, db: AsyncSession = Depends(get_db)):
    await svc.delete_supplier(db, supplier_id)
