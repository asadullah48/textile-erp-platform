"""Role → permission map. The single source of truth for RBAC.

Checked by `require_permission(...)` before a request reaches its handler, and
returned by GET /auth/me so the frontend can hide actions a role cannot take.
The UI hint is a convenience only — the API check is the enforcement.
"""

ROLES = ("owner", "manager", "operator", "accountant")

PERMISSIONS: dict[str, dict[str, bool]] = {
    "fabric_read":    {"owner": True, "manager": True, "operator": True, "accountant": True},
    "fabric_write":   {"owner": True, "manager": True, "operator": True},
    "fabric_delete":  {"owner": True, "manager": True},
    "fabric_supplier_write": {"owner": True, "manager": True},
    "fabric_import_write":   {"owner": True, "manager": True, "accountant": True},
    "report_view":    {"owner": True, "manager": True, "operator": True, "accountant": True},
    "user_manage":    {"owner": True},
    "team_view":      {"owner": True, "manager": True},
    "billing_manage": {"owner": True},
    "audit_view":     {"owner": True},
    "tenant_settings_write": {"owner": True, "manager": True},
    "order_read":     {"owner": True, "manager": True, "operator": True, "accountant": True},
    "order_write":    {"owner": True, "manager": True, "operator": True},
    "bill_read":      {"owner": True, "manager": True, "accountant": True},
    "bill_write":     {"owner": True, "manager": True, "accountant": True},
    "finance_view":   {"owner": True, "manager": True, "accountant": True},
    "ledger_view":    {"owner": True, "manager": True, "accountant": True},
    "inventory_view": {"owner": True, "manager": True, "operator": True},
    "inventory_write":{"owner": True, "manager": True, "operator": True},
}


def permissions_for(role: str | None) -> list[str]:
    return sorted(k for k, roles in PERMISSIONS.items() if roles.get(role or "", False))
