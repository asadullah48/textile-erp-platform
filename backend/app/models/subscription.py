import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.types import Numeric
from sqlalchemy.sql import func
from app.models.base import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), nullable=False, unique=True)   # free | pro | business | enterprise
    display_name = Column(String(100), nullable=False)
    price_pkr = Column(Numeric(10, 2), nullable=False, default=0)
    price_usd = Column(Numeric(10, 2), nullable=False, default=0)
    max_users = Column(Integer)                  # NULL = unlimited
    max_orders_per_month = Column(Integer)       # NULL = unlimited
    features = Column(JSONB, nullable=False)
    stripe_price_id_pkr = Column(String(100))
    stripe_price_id_usd = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TenantSubscription(Base):
    __tablename__ = "tenant_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=False)
    status = Column(String(20), nullable=False, default="trialing")
    # trialing | active | past_due | canceled | unpaid
    trial_ends_at = Column(DateTime(timezone=True))
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    stripe_subscription_id = Column(String(100))
    provider_subscription_ref = Column(String(200))
    payment_provider = Column(String(20))
    canceled_at = Column(DateTime(timezone=True))
    cancel_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UsageRecord(Base):
    """Monthly usage counters per tenant. Upserted on each relevant action."""
    __tablename__ = "usage_records"
    __table_args__ = (UniqueConstraint("tenant_id", "month"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    month = Column(String(7), nullable=False)   # "2026-04" (YYYY-MM)
    orders_created = Column(Integer, default=0, nullable=False)
    active_users = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PaymentRecord(Base):
    """Immutable record of every billing transaction."""
    __tablename__ = "payment_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("tenant_subscriptions.id"))
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False)         # PKR | USD
    payment_provider = Column(String(20), nullable=False)
    provider_reference_id = Column(String(200))
    status = Column(String(20), nullable=False, default="pending")
    # pending | succeeded | failed | refunded
    created_at = Column(DateTime(timezone=True), server_default=func.now())
