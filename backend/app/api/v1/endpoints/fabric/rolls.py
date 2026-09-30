"""/fabric-rolls — rolls across lots, issuance and traceability."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id, get_current_user_id, require_permission
from app.schemas.fabric import (
    Department, FabricRollRead, FabricRollUpdate, IssuanceRead, IssueRollRequest, RollStatus, RollTrace,
)
from app.services import fabric_service as svc
from app.services import report_service

router = APIRouter(tags=["fabric-rolls"])
READ = [require_permission("fabric_read")]
WRITE = [require_permission("fabric_write")]


@router.get("/fabric-rolls", response_model=list[FabricRollRead], dependencies=READ)
async def list_rolls(
    lot_id: Optional[UUID] = None,
    status: Optional[RollStatus] = None,
    search: Optional[str] = Query(default=None, max_length=100),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_rolls(db, lot_id, status=status, search=search, limit=limit, offset=offset)


@router.get("/fabric-rolls/{roll_id}", response_model=FabricRollRead, dependencies=READ)
async def get_roll(roll_id: UUID, db: AsyncSession = Depends(get_db)):
    return await svc.get_roll(db, roll_id)


@router.patch("/fabric-rolls/{roll_id}", response_model=FabricRollRead, dependencies=WRITE)
async def update_roll(roll_id: UUID, payload: FabricRollUpdate, db: AsyncSession = Depends(get_db)):
    return await svc.update_roll(db, roll_id, payload)


@router.delete("/fabric-rolls/{roll_id}", status_code=204, dependencies=[require_permission("fabric_delete")])
async def delete_roll(roll_id: UUID, db: AsyncSession = Depends(get_db)):
    await svc.delete_roll(db, roll_id)


@router.post("/fabric-rolls/{roll_id}/issue", response_model=IssuanceRead, status_code=201, dependencies=WRITE)
async def issue_roll(roll_id: UUID, payload: IssueRollRequest, db: AsyncSession = Depends(get_db),
                     tenant_id: str = Depends(get_current_tenant_id),
                     user_id: str = Depends(get_current_user_id)):
    return await svc.issue_roll(db, tenant_id, user_id, roll_id, payload)


@router.get("/fabric-rolls/{roll_id}/issuances", response_model=list[IssuanceRead], dependencies=READ)
async def roll_issuances(roll_id: UUID, db: AsyncSession = Depends(get_db)):
    await svc.get_roll(db, roll_id)
    return await svc.list_issuances(db, roll_id)


@router.get("/fabric-rolls/{roll_id}/trace", response_model=RollTrace, dependencies=READ)
async def roll_trace(roll_id: UUID, db: AsyncSession = Depends(get_db)):
    return await report_service.roll_trace(db, roll_id)


@router.get("/fabric-issuances", response_model=list[IssuanceRead], dependencies=READ)
async def list_issuances(
    department: Optional[Department] = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_issuances(db, department=department, limit=limit, offset=offset)
