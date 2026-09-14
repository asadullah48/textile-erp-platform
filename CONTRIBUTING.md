# Contributing

Thanks for considering a contribution to Textile ERP Platform.

## Before you start

This repo is spec-first: `SPEC-ERP.md` is the authoritative source for database schema, API
contracts, and frontend routes. If your change touches any of those, check the spec first —
implementation decisions should trace back to it, and a change that contradicts it usually
means the spec needs updating too, not just the code.

`ROADMAP.md` shows what's built versus staged. If you want to work on something from a
later stage, open an issue first — some of it depends on earlier stages landing.

## Setup

```bash
git clone https://github.com/asadullah48/textile-erp-platform.git
cd textile-erp-platform
cp .env.example .env   # set POSTGRES_PASSWORD and SECRET_KEY
docker compose up --build
```

Or run backend/frontend separately — see [README.md § Getting Started](./README.md#getting-started).

## Before opening a PR

```bash
cd backend && uv run pytest -x -v
cd frontend && npm run build
```

Both must pass — CI runs the same two checks. If you're adding an endpoint, add tests for it in
`backend/app/tests/`; `test_tenancy_isolation.py` is a reference for the two-tenant fixture
pattern (`tenant_a`, `tenant_b`, `auth()` from `conftest.py`).

## Multi-tenancy is not optional

Every new table needs a `tenant_id` column and an RLS policy (see the existing Alembic
migrations for the pattern) — not just an application-level filter. The whole point of the
architecture is that tenant isolation doesn't depend on every query remembering to add a
`WHERE tenant_id = ...` clause.

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) — one logical change per
commit.

## Questions

Open an issue, or reach out via the links on [the author's portfolio](https://asadullahshafique-devunity.vercel.app).
