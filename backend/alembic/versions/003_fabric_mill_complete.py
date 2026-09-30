"""fabric mill module 1 completion: suppliers, imports, issuances, yarn stock,
weaving/knitting sessions; auth-safe RLS; demo tenants

Revision ID: 003
Revises: 002
Create Date: 2026-09-30

Additive only — no existing column is dropped or retyped, so rows written by
revisions 001/002 survive untouched.

RLS hardening: after a transaction-local set_config() ends, a pooled
connection reports current_setting('app.tenant_id', true) as '' (empty string),
not NULL, and ''::uuid raises. Every policy is recreated with NULLIF(...) so an
unset context deterministically matches zero rows instead of erroring.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

TENANT_EXPR = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"
USER_EXPR = "NULLIF(current_setting('app.user_id', true), '')::uuid"

EXISTING_RLS_TABLES = ["tenant_users", "fabric_lots", "fabric_rolls"]
NEW_TABLES = [
    "fabric_suppliers",
    "fabric_imports",
    "yarn_types",
    "yarn_transactions",
    "fabric_issuances",
    "weaving_sessions",
    "knitting_sessions",
]


def _uuid(name: str, *args, **kw) -> sa.Column:
    return sa.Column(name, postgresql.UUID(as_uuid=True), *args, **kw)


def _base_columns() -> list[sa.Column]:
    return [
        _uuid("id", primary_key=True),
        _uuid("tenant_id", sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    ]


def _tenant_policy(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
    op.execute(f"""
        CREATE POLICY tenant_isolation ON {table}
        USING (tenant_id = {TENANT_EXPR})
        WITH CHECK (tenant_id = {TENANT_EXPR})
    """)


def upgrade() -> None:
    # ---- demo workspaces --------------------------------------------------
    op.add_column("tenants", sa.Column("is_demo", sa.Boolean, server_default="false", nullable=False))

    # ---- new tables --------------------------------------------------------
    op.create_table(
        "fabric_suppliers", *_base_columns(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_person", sa.String(100)),
        sa.Column("phone", sa.String(30)),
        sa.Column("email", sa.String(255)),
        sa.Column("address", sa.Text),
        sa.Column("city", sa.String(100)),
        sa.Column("country", sa.String(2), server_default="PK", nullable=False),
        sa.Column("payment_terms", sa.String(100)),
        sa.Column("notes", sa.Text),
    )
    op.create_index("idx_fabric_suppliers_tenant", "fabric_suppliers", ["tenant_id", "id"])

    op.create_table(
        "fabric_imports", *_base_columns(),
        sa.Column("lc_number", sa.String(50), nullable=False),
        sa.Column("shipment_reference", sa.String(50)),
        _uuid("supplier_id", sa.ForeignKey("fabric_suppliers.id"), nullable=False),
        sa.Column("fabric_type", sa.String(100), nullable=False),
        sa.Column("quantity_meters", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity_kg", sa.Numeric(12, 3)),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("fob_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("exchange_rate", sa.Numeric(10, 4), nullable=False),
        sa.Column("freight_cost_pkr", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("insurance_cost_pkr", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("duties_paid_pkr", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("total_landed_cost_pkr", sa.Numeric(16, 2), nullable=False),
        sa.Column("landed_cost_per_meter_pkr", sa.Numeric(12, 4), nullable=False),
        sa.Column("port_of_entry", sa.String(50), server_default="Karachi", nullable=False),
        sa.Column("lc_opened_date", sa.Date, nullable=False),
        sa.Column("clearance_date", sa.Date),
        sa.Column("warehouse_arrival_date", sa.Date),
        sa.Column("status", sa.String(20), server_default="in_transit", nullable=False),
        sa.Column("notes", sa.Text),
    )
    op.create_index("idx_fabric_imports_tenant", "fabric_imports", ["tenant_id", "id"])
    op.create_index("idx_fabric_imports_status", "fabric_imports", ["tenant_id", "status"])

    op.create_table(
        "yarn_types", *_base_columns(),
        sa.Column("yarn_count", sa.String(20), nullable=False),
        sa.Column("ply", sa.Integer, server_default="1", nullable=False),
        sa.Column("fiber_type", sa.String(50), nullable=False),
        sa.Column("color_name", sa.String(100)),
        _uuid("supplier_id", sa.ForeignKey("fabric_suppliers.id")),
        sa.Column("unit_cost_per_kg", sa.Numeric(10, 2), nullable=False),
        sa.Column("reorder_level_kg", sa.Numeric(10, 3), server_default="0", nullable=False),
        sa.Column("current_stock_kg", sa.Numeric(12, 3), server_default="0", nullable=False),
        sa.Column("notes", sa.Text),
        sa.CheckConstraint("current_stock_kg >= 0", name="ck_yarn_stock_non_negative"),
    )
    op.create_index("idx_yarn_types_tenant", "yarn_types", ["tenant_id", "id"])

    op.create_table(
        "yarn_transactions", *_base_columns(),
        # Strict posting order. created_at is the *transaction* start time, so
        # several movements posted in one request would otherwise tie.
        sa.Column("seq", sa.BigInteger, sa.Identity(always=True), nullable=False, unique=True),
        _uuid("yarn_type_id", sa.ForeignKey("yarn_types.id"), nullable=False),
        sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("quantity_kg", sa.Numeric(12, 3), nullable=False),
        sa.Column("balance_after_kg", sa.Numeric(12, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(10, 2)),
        sa.Column("total_cost", sa.Numeric(14, 2)),
        sa.Column("lot_reference", sa.String(100)),
        sa.Column("order_reference", sa.String(50)),
        sa.Column("source", sa.String(30), server_default="manual", nullable=False),
        sa.Column("transaction_date", sa.Date, nullable=False),
        sa.Column("notes", sa.Text),
        _uuid("created_by", sa.ForeignKey("users.id"), nullable=False),
        sa.CheckConstraint("quantity_kg > 0", name="ck_yarn_txn_qty_positive"),
    )
    op.create_index("idx_yarn_txn_tenant_type", "yarn_transactions", ["tenant_id", "yarn_type_id"])
    op.create_index("idx_yarn_txn_date", "yarn_transactions", ["tenant_id", "transaction_date"])

    op.create_table(
        "fabric_issuances", *_base_columns(),
        _uuid("roll_id", sa.ForeignKey("fabric_rolls.id"), nullable=False),
        sa.Column("issued_to_department", sa.String(50), nullable=False),
        sa.Column("cmt_order_reference", sa.String(50)),
        sa.Column("issued_meters", sa.Numeric(10, 2), nullable=False),
        sa.Column("issued_kg", sa.Numeric(10, 3)),
        sa.Column("issued_date", sa.Date, nullable=False),
        _uuid("issued_by", sa.ForeignKey("users.id"), nullable=False),
        sa.Column("notes", sa.Text),
    )
    op.create_index("idx_issuance_tenant_roll", "fabric_issuances", ["tenant_id", "roll_id"])

    op.create_table(
        "weaving_sessions", *_base_columns(),
        _uuid("lot_id", sa.ForeignKey("fabric_lots.id"), nullable=False),
        sa.Column("loom_number", sa.String(20), nullable=False),
        sa.Column("operator_name", sa.String(100)),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("shift", sa.String(10), server_default="day", nullable=False),
        sa.Column("start_time", sa.Time),
        sa.Column("end_time", sa.Time),
        sa.Column("picks_per_inch", sa.Integer),
        sa.Column("ends_per_inch", sa.Integer),
        sa.Column("produced_meters", sa.Numeric(10, 2), nullable=False),
        sa.Column("produced_kg", sa.Numeric(10, 3)),
        sa.Column("quality_grade", sa.String(1), server_default="A", nullable=False),
        _uuid("yarn_type_id", sa.ForeignKey("yarn_types.id")),
        sa.Column("yarn_consumed_kg", sa.Numeric(10, 3)),
        _uuid("yarn_transaction_id", sa.ForeignKey("yarn_transactions.id")),
        sa.Column("notes", sa.Text),
    )
    op.create_index("idx_weaving_tenant_lot", "weaving_sessions", ["tenant_id", "lot_id"])
    op.create_index("idx_weaving_date", "weaving_sessions", ["tenant_id", "session_date"])

    op.create_table(
        "knitting_sessions", *_base_columns(),
        _uuid("yarn_type_id", sa.ForeignKey("yarn_types.id"), nullable=False),
        _uuid("lot_id", sa.ForeignKey("fabric_lots.id")),
        sa.Column("machine_number", sa.String(20), nullable=False),
        sa.Column("operator_name", sa.String(100)),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("shift", sa.String(10), server_default="day", nullable=False),
        sa.Column("gauge", sa.Integer),
        sa.Column("course_count", sa.Integer),
        sa.Column("produced_kg", sa.Numeric(10, 3), nullable=False),
        sa.Column("yarn_consumed_kg", sa.Numeric(10, 3), nullable=False),
        sa.Column("quality_grade", sa.String(1), server_default="A", nullable=False),
        _uuid("yarn_transaction_id", sa.ForeignKey("yarn_transactions.id")),
        sa.Column("notes", sa.Text),
    )
    op.create_index("idx_knitting_tenant_yarn", "knitting_sessions", ["tenant_id", "yarn_type_id"])
    op.create_index("idx_knitting_date", "knitting_sessions", ["tenant_id", "session_date"])

    # ---- extend lots / rolls (nullable or defaulted → safe on live data) ----
    op.add_column("fabric_lots", sa.Column("fabric_category", sa.String(20), server_default="woven", nullable=False))
    op.add_column("fabric_lots", _uuid("supplier_id", sa.ForeignKey("fabric_suppliers.id")))
    op.add_column("fabric_lots", _uuid("import_id", sa.ForeignKey("fabric_imports.id")))
    op.add_column("fabric_lots", sa.Column("cost_per_meter", sa.Numeric(12, 4)))
    op.add_column("fabric_rolls", sa.Column("issued_meters", sa.Numeric(10, 2), server_default="0", nullable=False))
    op.add_column("fabric_rolls", sa.Column("grade", sa.String(1)))

    # ---- RLS ----------------------------------------------------------------
    for table in EXISTING_RLS_TABLES:
        _tenant_policy(table)

    # Login needs to find which tenant a user belongs to before any tenant
    # context exists. Rather than bypassing RLS, a user may read *their own*
    # membership rows once the auth flow has set app.user_id (after the
    # password check). Permissive policies are OR-ed, so this only ever widens
    # visibility to rows where user_id matches the authenticated user.
    op.execute("DROP POLICY IF EXISTS self_membership ON tenant_users")
    op.execute(f"""
        CREATE POLICY self_membership ON tenant_users
        FOR SELECT USING (user_id = {USER_EXPR})
    """)

    for table in NEW_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        _tenant_policy(table)
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS self_membership ON tenant_users")
    for table in reversed(NEW_TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")

    op.drop_column("fabric_rolls", "grade")
    op.drop_column("fabric_rolls", "issued_meters")
    op.drop_column("fabric_lots", "cost_per_meter")
    op.drop_column("fabric_lots", "import_id")
    op.drop_column("fabric_lots", "supplier_id")
    op.drop_column("fabric_lots", "fabric_category")

    for table in ["knitting_sessions", "weaving_sessions", "fabric_issuances",
                  "yarn_transactions", "yarn_types", "fabric_imports", "fabric_suppliers"]:
        op.drop_table(table)

    # restore the pre-003 policy text
    for table in EXISTING_RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"""
            CREATE POLICY tenant_isolation ON {table}
            USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
        """)
    op.drop_column("tenants", "is_demo")
