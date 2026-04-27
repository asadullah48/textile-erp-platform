# Textile ERP Platform

Multi-tenant Fabric Mill ERP SaaS — manage fabric lots, rolls, and inventory with complete tenant isolation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 async, pydantic v2 |
| Frontend | Next.js 15, TypeScript, shadcn/ui (base-ui v4), Tailwind CSS v4 |
| Database | PostgreSQL 16 with Row Level Security |
| Infra | Docker Compose, Alembic migrations |

---

## Quick Start with Docker Compose

```bash
# 1. Clone the repo
git clone <repo-url>
cd textile-erp-platform

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and SECRET_KEY

# 3. Start all services
docker compose up --build

# 4. Open the app
open http://localhost:3000

# 5. Register your workspace at /register, then sign in at /login
```

---

## Manual Dev Setup

### Backend

```bash
cd backend

# Install dependencies (requires uv: https://docs.astral.sh/uv/)
uv sync

# Configure environment
cp ../.env.example ../.env
# Edit .env — set DATABASE_URL to your local postgres

# Run migrations
uv run alembic upgrade head

# Start dev server (hot-reload)
uv run uvicorn app.main:app --reload
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# App: http://localhost:3000
```

---

## Running Tests

```bash
cd backend

# Run all tests with verbose output
uv run pytest -x -v

# Expected: 5 tenancy isolation tests PASS
```

---

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/register-tenant` | Create tenant + admin user, returns JWT |
| `POST` | `/api/v1/auth/login` | Login, returns JWT |
| `GET` | `/api/v1/auth/me` | Current user info (requires auth) |

### Fabric Lots

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/fabric-lots` | List all lots (tenant-scoped) |
| `POST` | `/api/v1/fabric-lots` | Create lot |
| `GET` | `/api/v1/fabric-lots/{id}` | Get lot by ID |
| `PATCH` | `/api/v1/fabric-lots/{id}` | Update lot |
| `DELETE` | `/api/v1/fabric-lots/{id}` | Soft-delete lot |
| `GET` | `/api/v1/fabric-lots/{id}/summary` | Roll count + meters by status |

### Fabric Rolls

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/fabric-rolls` | List all rolls (tenant-scoped) |
| `GET` | `/api/v1/fabric-rolls/{id}` | Get roll by ID |
| `PATCH` | `/api/v1/fabric-rolls/{id}` | Update roll |
| `DELETE` | `/api/v1/fabric-rolls/{id}` | Soft-delete roll |
| `GET` | `/api/v1/fabric-lots/{lotId}/rolls` | Rolls for a specific lot |
| `POST` | `/api/v1/fabric-lots/{lotId}/rolls` | Add roll to lot |

---

## Architecture

**Multi-tenancy via PostgreSQL RLS:** Every table has a `tenant_id` column and a Row Level Security policy. The FastAPI `get_db` dependency sets `SET LOCAL app.tenant_id = '<id>'` at the start of each request transaction, automatically scoping all queries to the current tenant. Tenants are completely isolated at the database level — no service-layer filter can accidentally leak cross-tenant data.

**JWT Auth:** Login returns a signed JWT containing `user_id`, `tenant_id`, `role`, and `plan`. Every protected endpoint depends on `get_current_tenant_id` which decodes the JWT and passes the tenant ID to `get_db`.

**Frontend:** Next.js App Router with a route group `(dashboard)` for protected pages. Token stored in localStorage + a JS cookie. Middleware redirects unauthenticated users to `/login`.
