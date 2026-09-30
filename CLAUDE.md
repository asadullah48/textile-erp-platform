# Textile ERP Platform — CLAUDE.md

## Project Overview

Multi-tenant Fabric Mill SaaS ERP. Each tenant is a company (fabric mill, CMT factory, export house). Data isolation is enforced at the database level via PostgreSQL Row Level Security. Backend is FastAPI + SQLAlchemy async; frontend is Next.js 15 + shadcn/ui.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL 16 RLS, pydantic v2, Next.js 15, TypeScript strict, shadcn/ui (base-ui v4), Tailwind CSS v4, Docker Compose.

---

## Directory Tree (key paths)

```
backend/
  app/core/          config, database (set_tenant_context / set_user_context), permissions, middleware/tenancy
  app/models/        base (TenantBaseModel), tenant, subscription, fabric (all Module 1 models)
  app/schemas/       auth, fabric
  app/services/      tenant_service (auth, team, demo), fabric_service (suppliers, lots, rolls, issuance),
                     production_service (yarn ledger, weaving, knitting), import_service (LC, landed cost),
                     report_service (reports, Mill Pulse, trace, CSV), demo_seed
  app/api/v1/endpoints/  auth, team, fabric/{suppliers,lots,rolls,yarn,production,imports,reports}
  app/tests/         conftest, test_auth, test_fabric_lots, test_tenancy_isolation, test_fabric_module
  alembic/versions/  001 tenancy, 002 lots/rolls, 003 Module 1 completion + RLS hardening
  scripts/           create_app_role.sql, docker-init-app-role.sh
frontend/src/
  app/               / (landing), login, register, (dashboard)/{dashboard,fabric-lots,fabric-rolls,imports,
                     yarn,weaving,knitting,suppliers,reports,team}
  components/erp/    kit (tables, forms, dialogs, stat cards, insight cards), IssueRollDialog, AuthShell
  lib/demo/          browser demo: engine (rules), reports, seed, adapter (axios)
  services/erp.ts    typed client for every endpoint
docs/                MODULE-1.md (API, invariants, spec deviations), DEPLOY.md
```

---

## Key Commands

| Action | Command |
|--------|---------|
| Backend dev server | `cd backend && uv run uvicorn app.main:app --reload` |
| Frontend dev server | `cd frontend && npm run dev` |
| Run migrations | `cd backend && uv run alembic upgrade head` |
| Run tests | `cd backend && uv run pytest -v` (as a NON-superuser role — see RLS notes) |
| Frontend typecheck | `cd frontend && npm run typecheck` |
| Browser-demo build | `cd frontend && NEXT_PUBLIC_DEMO_MODE=browser npm run build` |
| Docker (full stack) | `docker compose up --build` |
| New migration | `cd backend && uv run alembic revision -m "description"` |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | asyncpg URL of the least-privilege app role | required |
| `MIGRATIONS_DATABASE_URL` | Owner URL used only by Alembic | falls back to admin/DATABASE_URL |
| `DATABASE_ADMIN_URL` | Optional separate URL for auth flows (BYPASSRLS not required) | DATABASE_URL |
| `DEMO_ENABLED` / `DEMO_MAX_LIVE` | One-click demo workspaces | `true` / `200` |
| `NEXT_PUBLIC_DEMO_MODE` | `browser` = serve the API from the browser (public demo) | unset |
| `SECRET_KEY` | JWT signing key (min 32 chars) | required |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT TTL in minutes | `480` |
| `POSTGRES_USER` | Postgres username (Docker) | `textile_user` |
| `POSTGRES_PASSWORD` | Postgres password (Docker) | required |
| `POSTGRES_DB` | Postgres database name (Docker) | `textile_erp` |
| `NEXT_PUBLIC_API_URL` | Backend URL visible to browser | `http://localhost:8000` |

Copy `.env.example` to `.env` and fill in secrets before running.

---

## Architecture Notes

### Row Level Security (RLS)

Every tenant table has `tenant_isolation` (FORCE) using
`tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` — the NULLIF makes a
reset GUC on a pooled connection match zero rows instead of raising. `get_db` scopes each
request with `set_tenant_context()` (bound `set_config(..., true)`, never string-built SQL).

**Superusers and BYPASSRLS roles ignore RLS even with FORCE.** The official postgres image
makes `POSTGRES_USER` a superuser, so the app must connect as the role created by
`backend/scripts/create_app_role.sql`. Startup logs CRITICAL otherwise, `/health/ready`
reports `rls_enforced`, and `test_app_connects_as_a_role_that_cannot_bypass_rls` fails.

Auth without bypass: registration sets `app.tenant_id` before inserting the owner
membership; login sets `app.user_id` only after the password check, unlocking the
`self_membership` SELECT policy on `tenant_users` (own rows only).

### JWT Flow

1. `POST /api/v1/auth/login` → validates email+password → returns JWT
2. JWT payload: `{ sub: user_id, tenant_id, role, plan, exp }`
3. `get_current_tenant_id` dependency decodes JWT and returns `tenant_id`
4. `get_db` uses `tenant_id` from the request to set the RLS session variable

### Tenant Isolation

Enforced at two layers:
- **DB layer**: RLS policy rejects rows where `tenant_id` ≠ `current_setting('app.tenant_id')`
- **Service layer**: `create_*` functions explicitly set `tenant_id=UUID(tenant_id)` on new records

### Frontend Auth

- Token stored in `localStorage` + a JS-accessible cookie (`access_token`)
- Cookie is read by `src/middleware.ts` to protect server-side route checks
- `AuthContext` provides `login`, `logout`, `register` — all update both storage mechanisms
- Axios interceptor attaches `Authorization: Bearer <token>` to every API request
- On 401 response: token cleared + redirect to `/login`

### shadcn v4 / base-ui Notes

shadcn v4.5 uses `@base-ui/react` instead of Radix UI. Key differences:
- `DialogTrigger`: use `render={<Button />}` instead of `asChild`
- `Select.onValueChange`: callback receives `string | null` (not just `string`)
- Dialog close button uses `render` prop on `DialogPrimitive.Close`

---

## Production Deployment

| Service | State |
|---|---|
| Frontend (browser demo) | https://textile-erp-platform.vercel.app — Vercel project `textile-erp-platform`, deployed with `vercel deploy --prod` from `frontend/` |
| Backend | **Not hosted** (no customer yet). Previous Koyeb service is gone; `frontend-three-kappa-64.vercel.app` now serves a different project (Bazaar). |

Full procedure for both paths: `docs/DEPLOY.md`. Neon note: asyncpg URLs need `?ssl=require`
and no `channel_binding`.

---

## Git Commit History (Sessions 1)

| Commit | Description |
|--------|-------------|
| Tasks 1-4 | uv init, config/db/security, base models, Alembic migration 001 |
| Tasks 5-7 | tenancy middleware, auth schemas, auth endpoints + FastAPI main |
| Tasks 8-9 | FabricLot+Roll models, migration 002, schemas+service+4 routers |
| Task 10 | pytest conftest + tenancy isolation tests (5 tests pass) |
| Task 11 | Next.js 15 scaffold + shadcn + auth context + fabric service |
| Task 12 | Login + register-tenant auth pages + middleware |
| Task 13 | Dashboard layout + fabric lot/roll pages |
| Task 14 | Docker Compose (postgres + backend + frontend) |
| Task 15 | CLAUDE.md + README + Session 1 checkpoint |
| Module 1 completion | RLS auth fixes, RBAC, migration 003, services, 42 tests, full UI, browser demo, least-privilege DB role, docs |
