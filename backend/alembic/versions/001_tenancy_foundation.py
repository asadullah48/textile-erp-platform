"""tenancy foundation: tenants, users, tenant_users, subscription_plans, tenant_subscriptions + RLS

Revision ID: 001
Revises:
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

TENANT_SCOPED_TABLES_WITH_RLS = ["tenant_users"]


def upgrade() -> None:
    # --- Global tables (no RLS) ---
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("industry", sa.String(50), nullable=False),
        sa.Column("city", sa.String(100)),
        sa.Column("country", sa.String(2), server_default="PK"),
        sa.Column("currency", sa.String(3), server_default="PKR"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("idx_users_email", "users", ["email"])

    op.create_table(
        "subscription_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("price_pkr", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("price_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("max_users", sa.Integer),
        sa.Column("max_orders_per_month", sa.Integer),
        sa.Column("features", postgresql.JSONB, nullable=False),
        sa.Column("stripe_price_id_pkr", sa.String(100)),
        sa.Column("stripe_price_id_usd", sa.String(100)),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_subscription_plans_name"),
    )

    # --- Tenant-scoped junction table (gets RLS) ---
    op.create_table(
        "tenant_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_tenant_user"),
    )
    op.create_index("idx_tenant_users_tenant", "tenant_users", ["tenant_id", "id"])

    op.create_table(
        "tenant_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("subscription_plans.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="trialing"),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True)),
        sa.Column("current_period_start", sa.DateTime(timezone=True)),
        sa.Column("current_period_end", sa.DateTime(timezone=True)),
        sa.Column("stripe_subscription_id", sa.String(100)),
        sa.Column("provider_subscription_ref", sa.String(200)),
        sa.Column("payment_provider", sa.String(20)),
        sa.Column("canceled_at", sa.DateTime(timezone=True)),
        sa.Column("cancel_reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- Seed subscription plans ---
    op.execute("""
        INSERT INTO subscription_plans (id, name, display_name, price_pkr, price_usd, max_users, max_orders_per_month, features)
        VALUES
        (gen_random_uuid(), 'free', 'Free', 0, 0, 1, 50,
         '{"fabric_mill": false, "inventory": false, "party_ledger_full": false,
           "finance_basic": false, "finance_full": false, "pdf_export": false,
           "excel_export": false, "api_access": false, "custom_branding": false}'::jsonb),
        (gen_random_uuid(), 'pro', 'Pro', 4999, 28, 5, null,
         '{"fabric_mill": true, "inventory": true, "party_ledger_full": true,
           "finance_basic": true, "finance_full": false, "pdf_export": true,
           "excel_export": false, "api_access": false, "custom_branding": false}'::jsonb),
        (gen_random_uuid(), 'business', 'Business', 12999, 72, null, null,
         '{"fabric_mill": true, "inventory": true, "party_ledger_full": true,
           "finance_basic": true, "finance_full": true, "pdf_export": true,
           "excel_export": true, "api_access": false, "custom_branding": false}'::jsonb)
    """)

    # --- RLS on tenant_users ---
    op.execute("ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation ON tenant_users
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    """)
    op.execute("ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON tenant_users")
    op.drop_table("tenant_subscriptions")
    op.drop_table("tenant_users")
    op.drop_table("subscription_plans")
    op.drop_table("users")
    op.drop_table("tenants")
