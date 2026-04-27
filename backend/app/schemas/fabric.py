"""Pydantic schemas for fabric lots and rolls."""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict

LotStatus = Literal["pending", "in_stock", "partially_consumed", "fully_consumed"]
RollStatus = Literal["available", "reserved", "consumed"]


class FabricLotCreate(BaseModel):
    lot_number: str
    fabric_type: str
    color: str
    gsm: Optional[Decimal] = None
    width_cm: Optional[Decimal] = None
    total_meters: Decimal
    received_date: date
    supplier: Optional[str] = None
    status: LotStatus = "pending"
    notes: Optional[str] = None


class FabricLotUpdate(BaseModel):
    lot_number: Optional[str] = None
    fabric_type: Optional[str] = None
    color: Optional[str] = None
    gsm: Optional[Decimal] = None
    width_cm: Optional[Decimal] = None
    total_meters: Optional[Decimal] = None
    received_date: Optional[date] = None
    supplier: Optional[str] = None
    status: Optional[LotStatus] = None
    notes: Optional[str] = None


class FabricLotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    lot_number: str
    fabric_type: str
    color: str
    gsm: Optional[Decimal]
    width_cm: Optional[Decimal]
    total_meters: Decimal
    received_date: date
    supplier: Optional[str]
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


class FabricRollCreate(BaseModel):
    roll_number: str
    length_meters: Decimal
    weight_kg: Optional[Decimal] = None
    status: RollStatus = "available"
    location: Optional[str] = None


class FabricRollUpdate(BaseModel):
    roll_number: Optional[str] = None
    length_meters: Optional[Decimal] = None
    weight_kg: Optional[Decimal] = None
    status: Optional[RollStatus] = None
    location: Optional[str] = None


class FabricRollRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    lot_id: UUID
    roll_number: str
    length_meters: Decimal
    weight_kg: Optional[Decimal]
    status: str
    location: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


class LotSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lot_id: UUID
    roll_count: int
    total_meters: Decimal
    meters_available: Decimal
    meters_reserved: Decimal
    meters_consumed: Decimal
