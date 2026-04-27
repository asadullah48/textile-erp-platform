# Textile ERP Platform — CLAUDE.md

## Project Overview

Multi-tenant Fabric Mill SaaS ERP. Each tenant is a company (fabric mill, CMT factory, export house). Data isolation is enforced at the database level via PostgreSQL Row Level Security. Backend is FastAPI + SQLAlchemy async; frontend is Next.js 15 + shadcn/ui.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL 16 RLS, pydantic v2, Next.js 15, TypeScript strict, shadcn/ui (base-ui v4), Tailwind CSS v4, Docker Compose.

---

## Directory Tree

```
textile-erp-platform/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── endpoints/
│   │   │   │   ├── auth.py          # /auth/login, /register-tenant, /me
│   │   │   │   └── fabric/
│   │   │   │       ├── lots.py      # CRUD /fabric-lots
│   │   │   │       ├── rolls.py     # standalone /fabric-rolls
│   │   │   │       ├── lot_rolls.py # nested /fabric-lots/{id}/rolls
│   │   │   │       └── summary.py   # /fabric-lots/{id}/summary
│   │   │   └── router.py
│   │   ├── core/
│   │   │   ├── config.py            # Settings (pydantic-settings)
│   │   │   ├── database.py          # AsyncEngine, get_db (sets app.tenant_id), get_admin_db
│   │   │   ├── dependencies.py      # get_current_user_id, get_current_tenant_id
│   │   │   └── security.py          # JWT encode/decode, password hashing
│   │   ├── models/
│   │   │   ├── base.py              # TenantBaseModel (id, tenant_id, timestamps, soft-delete)
│   │   │   ├── tenant.py            # Tenant, TenantUser, Subscription
│   │   │   └── fabric.py            # FabricLot, FabricRoll
│   │   ├── schemas/
│   │   │   ├── auth.py              # RegisterTenantRequest/Response, LoginRequest, UserOut, TenantOut
│   │   │   └── fabric.py            # FabricLot/Roll Create/Update/Read, LotSummary
│   │   ├── services/
│   │   │   ├── tenant_service.py    # register_tenant, login, get_me
│   │   │   └── fabric_service.py    # CRUD for lots + rolls + summary
│   │   ├── tests/
│   │   │   ├── conftest.py          # async client fixtures, two-tenant setup
│   │   │   └── test_tenancy_isolation.py
│   │   └── main.py                  # FastAPI app, lifespan, CORS
│   ├── alembic/
│   │   └── versions/
│   │       ├── 001_tenancy.py       # tenants, tenant_users, subscriptions + RLS
│   │       └── 002_fabric_mill.py   # fabric_lots, fabric_rolls + RLS
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── (dashboard)/
│       │   │   ├── layout.tsx        # sidebar + topbar
│       │   │   ├── dashboard/page.tsx
│       │   │   ├── fabric-lots/page.tsx
│       │   │   ├── fabric-lots/[lotId]/page.tsx
│       │   │   └── fabric-rolls/page.tsx
│       │   ├── login/page.tsx
│       │   ├── register/page.tsx
│       │   ├── layout.tsx            # root layout with AuthProvider
│       │   └── page.tsx              # redirects to /dashboard
│       ├── components/ui/            # shadcn components
│       ├── contexts/
│       │   └── AuthContext.tsx       # user/tenant state, login/logout/register
│       ├── lib/
│       │   ├── api.ts                # axios instance + interceptors
│       │   └── utils.ts              # cn, formatDate, formatMeters, statusColor
│       ├── services/
│       │   └── fabricService.ts      # typed wrappers for all fabric API endpoints
│       ├── types/
│       │   └── index.ts              # Tenant, User, Token, FabricLot, FabricRoll, FabricLotSummary
│       └── middleware.ts             # protect /dashboard, /fabric-lots, /fabric-rolls
├── docs/plans/
├── docker-compose.yml
├── .env.example
└── CLAUDE.md
```

---

## Key Commands

| Action | Command |
|--------|---------|
| Backend dev server | `cd backend && uv run uvicorn app.main:app --reload` |
| Frontend dev server | `cd frontend && npm run dev` |
| Run migrations | `cd backend && uv run alembic upgrade head` |
| Run tests | `cd backend && uv run pytest -x -v` |
| Docker (full stack) | `docker compose up --build` |
| New migration | `cd backend && uv run alembic revision -m "description"` |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL asyncpg URL | required |
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

Every table (`tenants`, `tenant_users`, `fabric_lots`, `fabric_rolls`) has:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
```

The `get_db` dependency in `backend/app/core/database.py` runs `SET LOCAL app.tenant_id = '<id>'` at the start of every request transaction, scoping all queries automatically.

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
