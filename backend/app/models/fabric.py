"""SQLAlchemy models for fabric inventory: lots and rolls."""
from sqlalchemy import Column, String, Numeric, Date, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import TenantBaseModel


class FabricLot(TenantBaseModel):
    __tablename__ = "fabric_lots"
    __table_args__ = (
        Index("idx_fabric_lots_tenant", "tenant_id", "id"),
        Index("idx_fabric_lots_lot_number", "tenant_id", "lot_number"),
    )

    lot_number = Column(String(100), nullable=False)
    fabric_type = Column(String(100), nullable=False)
    color = Column(String(100), nullable=False)
    gsm = Column(Numeric(8, 2))
    width_cm = Column(Numeric(8, 2))
    total_meters = Column(Numeric(10, 2), nullable=False)
    received_date = Column(Date, nullable=False)
    supplier = Column(String(200))
    status = Column(String(20), nullable=False, server_default="pending")
    notes = Column(Text)


class FabricRoll(TenantBaseModel):
    __tablename__ = "fabric_rolls"
    __table_args__ = (
        Index("idx_fabric_rolls_tenant", "tenant_id", "id"),
        Index("idx_fabric_rolls_lot", "lot_id"),
    )

    lot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("fabric_lots.id", ondelete="CASCADE"),
        nullable=False,
    )
    roll_number = Column(String(100), nullable=False)
    length_meters = Column(Numeric(10, 2), nullable=False)
    weight_kg = Column(Numeric(10, 3))
    status = Column(String(20), nullable=False, server_default="available")
    location = Column(String(200))
