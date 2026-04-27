"""fabric mill: fabric_lots and fabric_rolls tables with RLS

Revision ID: 002
Revises: 001
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

FABRIC_TABLES = ["fabric_lots", "fabric_rolls"]


def upgrade() -> None:
    op.create_table(
        "fabric_lots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lot_number", sa.String(100), nullable=False),
        sa.Column("fabric_type", sa.String(100), nullable=False),
        sa.Column("color", sa.String(100), nullable=False),
        sa.Column("gsm", sa.Numeric(8, 2)),
        sa.Column("width_cm", sa.Numeric(8, 2)),
        sa.Column("total_meters", sa.Numeric(10, 2), nullable=False),
        sa.Column("received_date", sa.Date, nullable=False),
        sa.Column("supplier", sa.String(200)),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("idx_fabric_lots_tenant", "fabric_lots", ["tenant_id", "id"])
    op.create_index("idx_fabric_lots_lot_number", "fabric_lots", ["tenant_id", "lot_number"])

    op.create_table(
        "fabric_rolls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lot_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("fabric_lots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("roll_number", sa.String(100), nullable=False),
        sa.Column("length_meters", sa.Numeric(10, 2), nullable=False),
        sa.Column("weight_kg", sa.Numeric(10, 3)),
        sa.Column("status", sa.String(20), nullable=False, server_default="available"),
        sa.Column("location", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("idx_fabric_rolls_tenant", "fabric_rolls", ["tenant_id", "id"])
    op.create_index("idx_fabric_rolls_lot", "fabric_rolls", ["lot_id"])

    for table in FABRIC_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"""
            CREATE POLICY tenant_isolation ON {table}
            USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
        """)
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in reversed(FABRIC_TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
    op.drop_table("fabric_rolls")
    op.drop_table("fabric_lots")
