"""/fabric-reports — inventory, consumption, production, Mill Pulse, CSV."""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.schemas.fabric import (
    ConsumptionReport, InsightsReport, InventorySummary, LowStockItem, ProductionReport,
)
from app.services import report_service as svc

router = APIRouter(prefix="/fabric-reports", tags=["fabric-reports"], dependencies=[require_permission("report_view")])


def _range(date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=29)
    if date_from > date_to:
        raise HTTPException(422, "'from' must be on or before 'to'")
    if (date_to - date_from).days > 366:
        raise HTTPException(422, "Range is limited to one year")
    return date_from, date_to


@router.get("/inventory-summary", response_model=InventorySummary)
async def inventory_summary(db: AsyncSession = Depends(get_db)):
    return await svc.inventory_summary(db)


@router.get("/consumption", response_model=ConsumptionReport)
async def consumption(date_from: Optional[date] = Query(default=None, alias="from"),
                      date_to: Optional[date] = Query(default=None, alias="to"),
                      db: AsyncSession = Depends(get_db)):
    return await svc.consumption_report(db, *_range(date_from, date_to))


@router.get("/production", response_model=ProductionReport)
async def production(date_from: Optional[date] = Query(default=None, alias="from"),
                     date_to: Optional[date] = Query(default=None, alias="to"),
                     db: AsyncSession = Depends(get_db)):
    return await svc.production_report(db, *_range(date_from, date_to))


@router.get("/low-stock", response_model=list[LowStockItem])
async def low_stock(db: AsyncSession = Depends(get_db)):
    return await svc.low_stock(db)


@router.get("/insights", response_model=InsightsReport)
async def insights(db: AsyncSession = Depends(get_db)):
    return await svc.insights(db)


@router.get("/stock.csv", response_class=Response)
async def stock_csv(db: AsyncSession = Depends(get_db)):
    body = await svc.stock_csv(db)
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="roll-stock-{date.today()}.csv"'})
