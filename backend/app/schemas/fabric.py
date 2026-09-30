"""Pydantic schemas for Module 1 — Fabric Mill."""
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

LotStatus = Literal["pending", "in_stock", "partially_consumed", "fully_consumed"]
RollStatus = Literal["available", "reserved", "issued", "consumed"]
FabricCategory = Literal["woven", "knitted", "imported", "yarn_fabric"]
Grade = Literal["A", "B", "C"]
Shift = Literal["day", "night", "A", "B", "C"]
Department = Literal["cutting", "stitching", "finishing", "packing", "dyeing", "sampling", "sale"]
ImportStatus = Literal["in_transit", "cleared", "warehoused", "consumed"]
YarnTxnType = Literal["receipt", "issue", "adjustment", "wastage"]

Money = Decimal
Positive = Field(gt=0)
NonNeg = Field(ge=0)


class _Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


# ------------------------------------------------------------------ suppliers

class SupplierCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: str = Field(default="PK", min_length=2, max_length=2)
    payment_terms: Optional[str] = None
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = Field(default=None, min_length=2, max_length=2)
    payment_terms: Optional[str] = None
    notes: Optional[str] = None


class SupplierRead(_Read):
    name: str
    contact_person: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    city: Optional[str]
    country: str
    payment_terms: Optional[str]
    notes: Optional[str]


class SupplierStats(BaseModel):
    lots_received: int
    meters_received: Decimal
    purchase_value_pkr: Decimal
    open_imports: int
    yarn_types_supplied: int


class SupplierDetail(SupplierRead):
    stats: SupplierStats


# ------------------------------------------------------------------ lots / rolls

class FabricLotCreate(BaseModel):
    lot_number: str = Field(min_length=1, max_length=100)
    fabric_type: str = Field(min_length=1, max_length=100)
    fabric_category: FabricCategory = "woven"
    color: str = Field(min_length=1, max_length=100)
    gsm: Optional[Decimal] = Field(default=None, gt=0)
    width_cm: Optional[Decimal] = Field(default=None, gt=0)
    total_meters: Decimal = Field(ge=0)
    received_date: date
    supplier: Optional[str] = None
    supplier_id: Optional[UUID] = None
    cost_per_meter: Optional[Decimal] = Field(default=None, ge=0)
    status: LotStatus = "pending"
    notes: Optional[str] = None


class FabricLotUpdate(BaseModel):
    lot_number: Optional[str] = Field(default=None, min_length=1, max_length=100)
    fabric_type: Optional[str] = None
    fabric_category: Optional[FabricCategory] = None
    color: Optional[str] = None
    gsm: Optional[Decimal] = Field(default=None, gt=0)
    width_cm: Optional[Decimal] = Field(default=None, gt=0)
    total_meters: Optional[Decimal] = Field(default=None, ge=0)
    received_date: Optional[date] = None
    supplier: Optional[str] = None
    supplier_id: Optional[UUID] = None
    cost_per_meter: Optional[Decimal] = Field(default=None, ge=0)
    status: Optional[LotStatus] = None
    notes: Optional[str] = None


class FabricLotRead(_Read):
    lot_number: str
    fabric_type: str
    fabric_category: str
    color: str
    gsm: Optional[Decimal]
    width_cm: Optional[Decimal]
    total_meters: Decimal
    received_date: date
    supplier: Optional[str]
    supplier_id: Optional[UUID]
    import_id: Optional[UUID]
    cost_per_meter: Optional[Decimal]
    status: str
    notes: Optional[str]


class FabricRollCreate(BaseModel):
    roll_number: str = Field(min_length=1, max_length=100)
    length_meters: Decimal = Field(gt=0)
    weight_kg: Optional[Decimal] = Field(default=None, gt=0)
    grade: Optional[Grade] = None
    status: Literal["available", "reserved"] = "available"
    location: Optional[str] = None


class FabricRollBulkCreate(BaseModel):
    """Register many rolls at once — how a truck delivery actually arrives."""
    prefix: str = Field(min_length=1, max_length=60)
    start: int = Field(default=1, ge=0)
    count: int = Field(ge=1, le=500)
    length_meters: Decimal = Field(gt=0)
    weight_kg: Optional[Decimal] = Field(default=None, gt=0)
    grade: Optional[Grade] = None
    location: Optional[str] = None


class FabricRollUpdate(BaseModel):
    roll_number: Optional[str] = None
    length_meters: Optional[Decimal] = Field(default=None, gt=0)
    weight_kg: Optional[Decimal] = Field(default=None, gt=0)
    grade: Optional[Grade] = None
    status: Optional[Literal["available", "reserved"]] = None  # issued/consumed only via /issue
    location: Optional[str] = None


class FabricRollRead(_Read):
    lot_id: UUID
    roll_number: str
    length_meters: Decimal
    issued_meters: Decimal
    remaining_meters: Decimal
    weight_kg: Optional[Decimal]
    grade: Optional[str]
    status: str
    location: Optional[str]

    @model_validator(mode="before")
    @classmethod
    def _remaining(cls, data):
        if not isinstance(data, dict):
            length = getattr(data, "length_meters", 0) or 0
            issued = getattr(data, "issued_meters", 0) or 0
            data = {k: getattr(data, k, None) for k in cls.model_fields if k != "remaining_meters"}
            data["remaining_meters"] = Decimal(length) - Decimal(issued)
        return data


class LotSummary(BaseModel):
    lot_id: UUID
    roll_count: int
    total_meters: Decimal
    meters_available: Decimal
    meters_reserved: Decimal
    meters_consumed: Decimal
    meters_issued: Decimal = Decimal("0")
    stock_value_pkr: Optional[Decimal] = None


# ------------------------------------------------------------------ issuance

class IssueRollRequest(BaseModel):
    issued_to_department: Department
    issued_meters: Optional[Decimal] = Field(default=None, gt=0)  # None → the whole remaining roll
    issued_kg: Optional[Decimal] = Field(default=None, gt=0)
    cmt_order_reference: Optional[str] = Field(default=None, max_length=50)
    issued_date: Optional[date] = None
    notes: Optional[str] = None


class IssuanceRead(_Read):
    roll_id: UUID
    issued_to_department: str
    cmt_order_reference: Optional[str]
    issued_meters: Decimal
    issued_kg: Optional[Decimal]
    issued_date: date
    issued_by: UUID
    notes: Optional[str]


# ------------------------------------------------------------------ yarn

class YarnTypeCreate(BaseModel):
    yarn_count: str = Field(min_length=1, max_length=20)
    ply: int = Field(default=1, ge=1, le=6)
    fiber_type: Literal["cotton", "polyester", "blended", "viscose", "acrylic", "nylon", "other"]
    color_name: Optional[str] = None
    supplier_id: Optional[UUID] = None
    unit_cost_per_kg: Decimal = Field(ge=0)
    reorder_level_kg: Decimal = Field(default=Decimal("0"), ge=0)
    opening_stock_kg: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None


class YarnTypeUpdate(BaseModel):
    yarn_count: Optional[str] = None
    ply: Optional[int] = Field(default=None, ge=1, le=6)
    fiber_type: Optional[str] = None
    color_name: Optional[str] = None
    supplier_id: Optional[UUID] = None
    unit_cost_per_kg: Optional[Decimal] = Field(default=None, ge=0)
    reorder_level_kg: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None
    # current_stock_kg is intentionally absent: stock moves only through transactions.


class YarnTypeRead(_Read):
    yarn_count: str
    ply: int
    fiber_type: str
    color_name: Optional[str]
    supplier_id: Optional[UUID]
    unit_cost_per_kg: Decimal
    reorder_level_kg: Decimal
    current_stock_kg: Decimal
    notes: Optional[str]


class YarnTransactionCreate(BaseModel):
    transaction_type: YarnTxnType
    quantity_kg: Decimal = Field(gt=0)
    direction: Optional[Literal["in", "out"]] = None  # required only for adjustment
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)
    lot_reference: Optional[str] = None
    order_reference: Optional[str] = None
    transaction_date: Optional[date] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _direction(self):
        implied = {"receipt": "in", "issue": "out", "wastage": "out"}.get(self.transaction_type)
        if implied:
            if self.direction and self.direction != implied:
                raise ValueError(f"{self.transaction_type} is always '{implied}'")
            self.direction = implied
        elif not self.direction:
            raise ValueError("adjustment requires direction 'in' or 'out'")
        return self


class YarnTransactionRead(_Read):
    yarn_type_id: UUID
    transaction_type: str
    direction: str
    quantity_kg: Decimal
    balance_after_kg: Decimal
    unit_cost: Optional[Decimal]
    total_cost: Optional[Decimal]
    lot_reference: Optional[str]
    order_reference: Optional[str]
    source: str
    transaction_date: date
    notes: Optional[str]
    created_by: UUID


# ------------------------------------------------------------------ production

class WeavingSessionCreate(BaseModel):
    lot_id: UUID
    loom_number: str = Field(min_length=1, max_length=20)
    operator_name: Optional[str] = None
    session_date: date
    shift: Shift = "day"
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    picks_per_inch: Optional[int] = Field(default=None, gt=0)
    ends_per_inch: Optional[int] = Field(default=None, gt=0)
    produced_meters: Decimal = Field(gt=0)
    produced_kg: Optional[Decimal] = Field(default=None, gt=0)
    quality_grade: Grade = "A"
    yarn_type_id: Optional[UUID] = None
    yarn_consumed_kg: Optional[Decimal] = Field(default=None, gt=0)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _yarn_pair(self):
        if (self.yarn_type_id is None) != (self.yarn_consumed_kg is None):
            raise ValueError("yarn_type_id and yarn_consumed_kg must be given together")
        return self


class WeavingSessionUpdate(BaseModel):
    """Production numbers only; yarn consumption is fixed once posted to the stock ledger."""
    operator_name: Optional[str] = None
    picks_per_inch: Optional[int] = Field(default=None, gt=0)
    ends_per_inch: Optional[int] = Field(default=None, gt=0)
    produced_meters: Optional[Decimal] = Field(default=None, gt=0)
    produced_kg: Optional[Decimal] = Field(default=None, gt=0)
    quality_grade: Optional[Grade] = None
    notes: Optional[str] = None


class WeavingSessionRead(_Read):
    lot_id: UUID
    loom_number: str
    operator_name: Optional[str]
    session_date: date
    shift: str
    start_time: Optional[time]
    end_time: Optional[time]
    picks_per_inch: Optional[int]
    ends_per_inch: Optional[int]
    produced_meters: Decimal
    produced_kg: Optional[Decimal]
    quality_grade: str
    yarn_type_id: Optional[UUID]
    yarn_consumed_kg: Optional[Decimal]
    yarn_transaction_id: Optional[UUID]
    notes: Optional[str]


class KnittingSessionCreate(BaseModel):
    yarn_type_id: UUID
    lot_id: Optional[UUID] = None
    machine_number: str = Field(min_length=1, max_length=20)
    operator_name: Optional[str] = None
    session_date: date
    shift: Shift = "day"
    gauge: Optional[int] = Field(default=None, gt=0)
    course_count: Optional[int] = Field(default=None, gt=0)
    produced_kg: Decimal = Field(gt=0)
    yarn_consumed_kg: Decimal = Field(gt=0)
    quality_grade: Grade = "A"
    notes: Optional[str] = None


class KnittingSessionUpdate(BaseModel):
    operator_name: Optional[str] = None
    gauge: Optional[int] = Field(default=None, gt=0)
    course_count: Optional[int] = Field(default=None, gt=0)
    produced_kg: Optional[Decimal] = Field(default=None, gt=0)
    quality_grade: Optional[Grade] = None
    notes: Optional[str] = None


class KnittingSessionRead(_Read):
    yarn_type_id: UUID
    lot_id: Optional[UUID]
    machine_number: str
    operator_name: Optional[str]
    session_date: date
    shift: str
    gauge: Optional[int]
    course_count: Optional[int]
    produced_kg: Decimal
    yarn_consumed_kg: Decimal
    quality_grade: str
    yarn_transaction_id: Optional[UUID]
    notes: Optional[str]


# ------------------------------------------------------------------ imports

class ImportCreate(BaseModel):
    lc_number: str = Field(min_length=1, max_length=50)
    shipment_reference: Optional[str] = None
    supplier_id: UUID
    fabric_type: str = Field(min_length=1, max_length=100)
    quantity_meters: Decimal = Field(gt=0)
    quantity_kg: Optional[Decimal] = Field(default=None, gt=0)
    currency: Literal["USD", "EUR", "CNY", "GBP", "AED", "TRY"]
    fob_cost: Decimal = Field(gt=0)
    exchange_rate: Decimal = Field(gt=0)
    freight_cost_pkr: Decimal = Field(default=Decimal("0"), ge=0)
    insurance_cost_pkr: Decimal = Field(default=Decimal("0"), ge=0)
    duties_paid_pkr: Decimal = Field(default=Decimal("0"), ge=0)
    port_of_entry: str = "Karachi"
    lc_opened_date: date
    notes: Optional[str] = None


class ImportUpdate(BaseModel):
    shipment_reference: Optional[str] = None
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0)
    freight_cost_pkr: Optional[Decimal] = Field(default=None, ge=0)
    insurance_cost_pkr: Optional[Decimal] = Field(default=None, ge=0)
    duties_paid_pkr: Optional[Decimal] = Field(default=None, ge=0)
    port_of_entry: Optional[str] = None
    clearance_date: Optional[date] = None
    warehouse_arrival_date: Optional[date] = None
    status: Optional[ImportStatus] = None
    notes: Optional[str] = None


class ImportRead(_Read):
    lc_number: str
    shipment_reference: Optional[str]
    supplier_id: UUID
    fabric_type: str
    quantity_meters: Decimal
    quantity_kg: Optional[Decimal]
    currency: str
    fob_cost: Decimal
    exchange_rate: Decimal
    freight_cost_pkr: Decimal
    insurance_cost_pkr: Decimal
    duties_paid_pkr: Decimal
    total_landed_cost_pkr: Decimal
    landed_cost_per_meter_pkr: Decimal
    port_of_entry: str
    lc_opened_date: date
    clearance_date: Optional[date]
    warehouse_arrival_date: Optional[date]
    status: str
    notes: Optional[str]


class ReceiveImportRequest(BaseModel):
    """Warehouse an import and open a fabric lot for it in one atomic step."""
    lot_number: str = Field(min_length=1, max_length=100)
    color: str = Field(default="As per LC", min_length=1)
    warehouse_arrival_date: Optional[date] = None
    roll_count: int = Field(default=0, ge=0, le=500)
    roll_prefix: Optional[str] = None
    location: Optional[str] = None


# ------------------------------------------------------------------ reports

class CategoryStock(BaseModel):
    fabric_category: str
    lots: int
    rolls_available: int
    meters_available: Decimal
    stock_value_pkr: Decimal


class YarnStockTotals(BaseModel):
    yarn_types: int
    stock_kg: Decimal
    stock_value_pkr: Decimal
    below_reorder: int


class InventorySummary(BaseModel):
    fabric: list[CategoryStock]
    yarn: YarnStockTotals
    total_value_pkr: Decimal
    unvalued_meters: Decimal  # meters in lots with no cost_per_meter — named, not hidden


class DepartmentIssue(BaseModel):
    department: str
    meters: Decimal


class ConsumptionReport(BaseModel):
    date_from: date
    date_to: date
    meters_received: Decimal
    meters_issued: Decimal
    issued_by_department: list[DepartmentIssue]
    yarn_in_kg: Decimal
    yarn_out_kg: Decimal


class LowStockItem(BaseModel):
    yarn_type_id: UUID
    label: str
    current_stock_kg: Decimal
    reorder_level_kg: Decimal
    shortfall_kg: Decimal


class LoomOutput(BaseModel):
    machine: str
    sessions: int
    output: Decimal
    grade_a_pct: Decimal


class ProductionReport(BaseModel):
    date_from: date
    date_to: date
    weaving_meters: Decimal
    knitting_kg: Decimal
    looms: list[LoomOutput]
    knitting_machines: list[LoomOutput]
    grade_mix: dict[str, int]


class Insight(BaseModel):
    """One deterministic finding. Every insight carries the numbers that fired it."""
    rule: str
    severity: Literal["critical", "warning", "info"]
    title: str
    detail: str
    evidence: dict[str, str]
    href: Optional[str] = None


class InsightsReport(BaseModel):
    generated_at: datetime
    rules_evaluated: int
    insights: list[Insight]


class TraceEvent(BaseModel):
    at: date
    kind: str
    title: str
    detail: Optional[str] = None


class RollTrace(BaseModel):
    roll: FabricRollRead
    lot: FabricLotRead
    supplier: Optional[SupplierRead]
    fabric_import: Optional[ImportRead]
    weaving_sessions: list[WeavingSessionRead]
    knitting_sessions: list[KnittingSessionRead]
    issuances: list[IssuanceRead]
    timeline: list[TraceEvent]
