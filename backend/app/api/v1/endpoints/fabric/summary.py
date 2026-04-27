"""Aggregate summary endpoint for a fabric lot."""
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_tenant_id
from app.schemas.fabric import LotSummary
from app.services import fabric_service

router = APIRouter(tags=["fabric-lots"])


@router.get("/fabric-lots/{lot_id}/summary", response_model=LotSummary)
async def lot_summary(
    lot_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_tenant_id),
):
    return await fabric_service.get_lot_summary(db, str(lot_id))
