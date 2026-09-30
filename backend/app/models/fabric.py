"""SQLAlchemy models for Module 1 — Fabric Mill.

Every table inherits TenantBaseModel (tenant_id + soft delete) and is protected
by the `tenant_isolation` RLS policy created in migrations 002/003.

Deviations from SPEC-ERP.md §6.2 are deliberate and documented in
docs/MODULE-1.md (e.g. operator_name instead of an operator user FK, because
loom operators on a Faisalabad floor rarely have their own login).
"""
from sqlalchemy import (
    Column, String, Numeric, Date, Text, ForeignKey, Index, Integer, Time,
)
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import TenantBaseModel


class FabricSupplier(TenantBaseModel):
    __tablename__ = "fabric_suppliers"
    __table_args__ = (Index("idx_fabric_suppliers_tenant", "tenant_id", "id"),)

    name = Column(String(200), nullable=False)
    contact_person = Column(String(100))
    phone = Column(String(30))
    email = Column(String(255))
    address = Column(Text)
    city = Column(String(100))
    country = Column(String(2), nullable=False, server_default="PK")
    payment_terms = Column(String(100))
    notes = Column(Text)


class FabricImport(TenantBaseModel):
    """Imported fabric tracked from LC opening to warehouse (SPEC §6.2 ImportedFabric)."""
    __tablename__ = "fabric_imports"
    __table_args__ = (
        Index("idx_fabric_imports_tenant", "tenant_id", "id"),
        Index("idx_fabric_imports_status", "tenant_id", "status"),
    )

    lc_number = Column(String(50), nullable=False)
    shipment_reference = Column(String(50))
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("fabric_suppliers.id"), nullable=False)
    fabric_type = Column(String(100), nullable=False)
    quantity_meters = Column(Numeric(12, 2), nullable=False)
    quantity_kg = Column(Numeric(12, 3))
    currency = Column(String(3), nullable=False)
    fob_cost = Column(Numeric(14, 2), nullable=False)
    exchange_rate = Column(Numeric(10, 4), nullable=False)
    freight_cost_pkr = Column(Numeric(14, 2), nullable=False, server_default="0")
    insurance_cost_pkr = Column(Numeric(14, 2), nullable=False, server_default="0")
    duties_paid_pkr = Column(Numeric(14, 2), nullable=False, server_default="0")
    total_landed_cost_pkr = Column(Numeric(16, 2), nullable=False)       # server-computed
    landed_cost_per_meter_pkr = Column(Numeric(12, 4), nullable=False)   # server-computed
    port_of_entry = Column(String(50), nullable=False, server_default="Karachi")
    lc_opened_date = Column(Date, nullable=False)
    clearance_date = Column(Date)
    warehouse_arrival_date = Column(Date)
    status = Column(String(20), nullable=False, server_default="in_transit")
    notes = Column(Text)


class FabricLot(TenantBaseModel):
    __tablename__ = "fabric_lots"
    __table_args__ = (
        Index("idx_fabric_lots_tenant", "tenant_id", "id"),
        Index("idx_fabric_lots_lot_number", "tenant_id", "lot_number"),
    )

    lot_number = Column(String(100), nullable=False)
    fabric_type = Column(String(100), nullable=False)
    fabric_category = Column(String(20), nullable=False, server_default="woven")
    color = Column(String(100), nullable=False)
    gsm = Column(Numeric(8, 2))
    width_cm = Column(Numeric(8, 2))
    total_meters = Column(Numeric(10, 2), nullable=False)
    received_date = Column(Date, nullable=False)
    supplier = Column(String(200))  # free-text, kept for backwards compatibility
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("fabric_suppliers.id"))
    import_id = Column(UUID(as_uuid=True), ForeignKey("fabric_imports.id"))
    cost_per_meter = Column(Numeric(12, 4))
    status = Column(String(20), nullable=False, server_default="pending")
    notes = Column(Text)


class FabricRoll(TenantBaseModel):
    __tablename__ = "fabric_rolls"
    __table_args__ = (
        Index("idx_fabric_rolls_tenant", "tenant_id", "id"),
        Index("idx_fabric_rolls_lot", "lot_id"),
    )

    lot_id = Column(UUID(as_uuid=True), ForeignKey("fabric_lots.id", ondelete="CASCADE"), nullable=False)
    roll_number = Column(String(100), nullable=False)
    length_meters = Column(Numeric(10, 2), nullable=False)
    issued_meters = Column(Numeric(10, 2), nullable=False, server_default="0")
    weight_kg = Column(Numeric(10, 3))
    grade = Column(String(1))
    status = Column(String(20), nullable=False, server_default="available")
    location = Column(String(200))


class FabricIssuance(TenantBaseModel):
    """A roll (or part of one) issued to a department / CMT order."""
    __tablename__ = "fabric_issuances"
    __table_args__ = (Index("idx_issuance_tenant_roll", "tenant_id", "roll_id"),)

    roll_id = Column(UUID(as_uuid=True), ForeignKey("fabric_rolls.id"), nullable=False)
    issued_to_department = Column(String(50), nullable=False)
    cmt_order_reference = Column(String(50))
    issued_meters = Column(Numeric(10, 2), nullable=False)
    issued_kg = Column(Numeric(10, 3))
    issued_date = Column(Date, nullable=False)
    issued_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    notes = Column(Text)


class YarnType(TenantBaseModel):
    """current_stock_kg is denormalised and only ever changed via YarnTransaction."""
    __tablename__ = "yarn_types"
    __table_args__ = (Index("idx_yarn_types_tenant", "tenant_id", "id"),)

    yarn_count = Column(String(20), nullable=False)
    ply = Column(Integer, nullable=False, server_default="1")
    fiber_type = Column(String(50), nullable=False)
    color_name = Column(String(100))
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("fabric_suppliers.id"))
    unit_cost_per_kg = Column(Numeric(10, 2), nullable=False)
    reorder_level_kg = Column(Numeric(10, 3), nullable=False, server_default="0")
    current_stock_kg = Column(Numeric(12, 3), nullable=False, server_default="0")
    notes = Column(Text)


class YarnTransaction(TenantBaseModel):
    """Append-only stock movement. balance_after_kg makes the ledger auditable row by row."""
    __tablename__ = "yarn_transactions"
    __table_args__ = (
        Index("idx_yarn_txn_tenant_type", "tenant_id", "yarn_type_id"),
        Index("idx_yarn_txn_date", "tenant_id", "transaction_date"),
    )

    yarn_type_id = Column(UUID(as_uuid=True), ForeignKey("yarn_types.id"), nullable=False)
    transaction_type = Column(String(20), nullable=False)  # receipt | issue | adjustment | wastage
    direction = Column(String(3), nullable=False)          # in | out
    quantity_kg = Column(Numeric(12, 3), nullable=False)   # always positive
    balance_after_kg = Column(Numeric(12, 3), nullable=False)
    unit_cost = Column(Numeric(10, 2))
    total_cost = Column(Numeric(14, 2))
    lot_reference = Column(String(100))
    order_reference = Column(String(50))
    source = Column(String(30), nullable=False, server_default="manual")  # manual | weaving | knitting
    transaction_date = Column(Date, nullable=False)
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


class WeavingSession(TenantBaseModel):
    __tablename__ = "weaving_sessions"
    __table_args__ = (
        Index("idx_weaving_tenant_lot", "tenant_id", "lot_id"),
        Index("idx_weaving_date", "tenant_id", "session_date"),
    )

    lot_id = Column(UUID(as_uuid=True), ForeignKey("fabric_lots.id"), nullable=False)
    loom_number = Column(String(20), nullable=False)
    operator_name = Column(String(100))
    session_date = Column(Date, nullable=False)
    shift = Column(String(10), nullable=False, server_default="day")
    start_time = Column(Time)
    end_time = Column(Time)
    picks_per_inch = Column(Integer)
    ends_per_inch = Column(Integer)
    produced_meters = Column(Numeric(10, 2), nullable=False)
    produced_kg = Column(Numeric(10, 3))
    quality_grade = Column(String(1), nullable=False, server_default="A")
    yarn_type_id = Column(UUID(as_uuid=True), ForeignKey("yarn_types.id"))
    yarn_consumed_kg = Column(Numeric(10, 3))
    yarn_transaction_id = Column(UUID(as_uuid=True), ForeignKey("yarn_transactions.id"))
    notes = Column(Text)


class KnittingSession(TenantBaseModel):
    __tablename__ = "knitting_sessions"
    __table_args__ = (
        Index("idx_knitting_tenant_yarn", "tenant_id", "yarn_type_id"),
        Index("idx_knitting_date", "tenant_id", "session_date"),
    )

    yarn_type_id = Column(UUID(as_uuid=True), ForeignKey("yarn_types.id"), nullable=False)
    lot_id = Column(UUID(as_uuid=True), ForeignKey("fabric_lots.id"))
    machine_number = Column(String(20), nullable=False)
    operator_name = Column(String(100))
    session_date = Column(Date, nullable=False)
    shift = Column(String(10), nullable=False, server_default="day")
    gauge = Column(Integer)
    course_count = Column(Integer)
    produced_kg = Column(Numeric(10, 3), nullable=False)
    yarn_consumed_kg = Column(Numeric(10, 3), nullable=False)
    quality_grade = Column(String(1), nullable=False, server_default="A")
    yarn_transaction_id = Column(UUID(as_uuid=True), ForeignKey("yarn_transactions.id"))
    notes = Column(Text)
