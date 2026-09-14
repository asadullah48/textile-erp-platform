# Textile ERP Platform

[![CI](https://github.com/asadullah48/textile-erp-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/asadullah48/textile-erp-platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Python 3.13](https://img.shields.io/badge/Python-3.13-green.svg)](https://www.python.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![Agentic AI Ladder: Foundation](https://img.shields.io/badge/Agentic%20AI%20Ladder-Foundation%20(pre--Rung%201)-lightgrey.svg)](#agentic-ai-alignment)

Multi-tenant Fabric Mill ERP SaaS — manage fabric lots, rolls, and inventory with complete tenant isolation.

*[Full specification](./SPEC-ERP.md) · [Roadmap](./ROADMAP.md)*

---

## Overview

Pakistan's textile SME sector runs on Excel registers and paper ledgers. This platform digitizes the first module of that value chain — fabric lot and roll tracking — on a proper multi-tenant SaaS foundation, so a fabric mill owner can register a workspace, log incoming lots and rolls as they arrive from suppliers, and get roll-count/meter summaries without a spreadsheet. It's built for mill owners and the small teams (managers, floor operators, accountants) who need role-scoped access to the same tenant's data.

This is **Session 1 of a specced 4-session build** (`SPEC-ERP.md` §13) — the tenancy and Fabric Mill foundation. CMT order lifecycle, party ledgers, financial reporting, and SaaS billing are designed but not yet built; see [Roadmap](#roadmap) for what's real today versus what's planned.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 (async), asyncpg, Alembic |
| Auth | JWT (`python-jose`), bcrypt password hashing, role-based permission map |
| Database | PostgreSQL 16 with Row-Level Security (tenant isolation enforced at the DB layer) |
| Frontend | Next.js 15 (App Router), TypeScript, React 19, Tailwind CSS v4, shadcn/ui (base-ui) |
| Infra | Docker Compose (local dev), Neon.tech (production Postgres target) |

---

## Features

- **Multi-tenant registration + JWT login** — `POST /auth/register-tenant`, `POST /auth/login`, `GET /auth/me`.
- **Fabric Mill module** — lot CRUD, roll CRUD nested under a lot, per-lot roll-count/meter summary, soft delete on both.
- **Database-enforced tenant isolation** — every table carries `tenant_id`; a PostgreSQL RLS policy plus `SET LOCAL app.tenant_id` on each request transaction means no service-layer query can accidentally leak cross-tenant rows, even if it forgets a `WHERE` clause.
- **Role-based permission map** — 4 roles (owner/manager/operator/accountant) × 15 permission keys, checked before a request reaches its handler.
- **Auth-gated frontend** — Next.js `(dashboard)` route group with middleware redirecting unauthenticated visitors to `/login`.

---

## Agentic AI Alignment

This repo has **no agent, no LLM call, and no tool-use loop today** — it's a CRUD SaaS backend. It doesn't sit on Rung 1 of the Agentic AI Ladder (Prompt → Context → SKILLs → Loop → Graph), since even that first rung implies a model call. What it does have is the structured, tenant-isolated substrate an agent layer would eventually operate *on*. The sections below name what's actually there today, and what it's genuinely being built toward — not marketing language.

**Autonomy**
- *Current*: `TenancyMiddleware` decodes the request JWT and the `PERMISSIONS` map (`app/core/permissions.py`) resolves an allow/deny decision per request — across 4 roles and 15 permission keys — with no human reviewing individual requests. That's a real, if small, autonomous decision surface.
- *Planned*: `SPEC-ERP.md` §13 Session 3 specs an aging-report endpoint (`GET /ledger/aging`, buckets at 15/45/75/120 days overdue). A natural next step once that lands is an agent that watches those buckets and drafts a payment-reminder action, instead of a human running the report on a schedule.

**Resilience**
- *Current*: PostgreSQL RLS is a second, independent enforcement layer *below* the service code — structurally identical in spirit to how GuardrailAI's deterministic rules re-check a result regardless of what the layer above already decided. A future endpoint that forgets its tenant filter still cannot leak another tenant's rows; the guarantee doesn't depend on every developer remembering to add one. Soft-delete (`is_deleted`) on tenant records is a smaller version of the same idea — a destructive action is recoverable, not a silent data-loss failure mode.
- *Planned*: Session 4 already specs a `PaymentProvider` Protocol with a full `StripeProvider` implementation plus stub `JazzCashProvider` / `EasyPaisaProvider` / `MeezanBankProvider` — genuine multi-provider failover for payment processing, not retrofitted for this document.

**Adaptivity**
- *Current*: tenant registration already captures an `industry` field (`fabric_mill | cmt | export_house | brand` — see `app/models/tenant.py`), which is schema-level room for multiple verticals. Nothing in the code branches on it yet — every tenant gets identical behavior regardless of declared industry today. That gap is named here on purpose rather than glossed over.
- *Planned*: Session 4's feature-flag middleware adapts the available endpoint surface to subscription plan (free/pro/business). A further step — not yet specced anywhere — would be the `industry` field actually changing which modules a tenant's UI and API surface expose.

---

## Roadmap

Staged using the same four-session pattern (spec-first, ~3 hours each) documented in full in [`SPEC-ERP.md`](./SPEC-ERP.md) §13, condensed here:

- **Stage 1 — Harden this repo (near-term).** CI running the tenancy tests plus new coverage for fabric-lot/roll CRUD and auth; MIT license; `CONTRIBUTING.md`; a typed frontend API client generated against the backend's schemas instead of hand-written fetch calls.
- **Stage 2 — CMT Integration** (`SPEC-ERP.md` Session 2). Transplant the 21 CMT models and 40+ endpoints from the author's live PoC, [`cmt-stitching-system`](https://github.com/asadullah48/cmt-stitching-system) (§14 documents the exact file-by-file map and the PoC→ERP code-pattern change: adding `tenant_id` + RLS to queries that previously filtered in application code). This is also the point where a read endpoint like the lot summary becomes a realistic candidate to wrap as a callable tool — the author's Prompt→Context→SKILLs ladder starting to apply to this codebase for the first time.
- **Stage 3 — Advanced Modules** (`SPEC-ERP.md` Session 3). Party ledgers, aging reports, P&L/balance-sheet/cash-flow, Excel export. A genuine Loop-engineering candidate here: a collections agent that reads the aging-bucket endpoint and iterates with TDD'd retry/escalate logic, rather than a human running the report weekly.
- **Stage 4 — SaaS & Production** (`SPEC-ERP.md` Session 4). Stripe plus Pakistani local-gateway support (JazzCash/EasyPaisa/MeezanBank), PWA, PDF invoicing, and production deploy. **Not** containerized Kubernetes/Dapr — the spec's own production target is Vercel (frontend) + Koyeb (backend, auto-deploy on push), matching the live `cmt-stitching-system` PoC's actual deployment. Docker Compose stays scoped to local dev, which is what it's for today.

---

## Use Cases

1. **Fabric mill onboarding.** A mill owner registers a workspace, logs in, and records incoming fabric lots and rolls as they arrive from suppliers — replacing an Excel register with a tenant-isolated system of record.
2. **Multi-tenant SaaS operation.** An operator running this platform for several unrelated mills relies on RLS, not application-code discipline, to guarantee Mill A's data is structurally unreachable by Mill B's users — a future engineer who forgets a `tenant_id` filter still can't leak cross-tenant rows.
3. **(Planned) Continuity from PoC to ERP.** Once Stage 2 lands, a mill running the live `cmt-stitching-system` PoC today keeps its fabric-lot history intact while gaining the full CMT order-to-dispatch lifecycle on the same tenant record — the transplant plan in `SPEC-ERP.md` §14 is designed for exactly this migration path.

---

## Getting Started

### Docker Compose (all services)

```bash
git clone https://github.com/asadullah48/textile-erp-platform.git
cd textile-erp-platform
cp .env.example .env
# edit .env — set POSTGRES_PASSWORD and SECRET_KEY
docker compose up --build
# App: http://localhost:3000 — register a workspace at /register, then sign in at /login
```

### Manual dev setup

**Backend** (requires [uv](https://docs.astral.sh/uv/)):
```bash
cd backend
uv sync
cp ../.env.example ../.env   # set DATABASE_URL to your local postgres
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
# API: http://localhost:8000 — Docs: http://localhost:8000/docs
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev
# App: http://localhost:3000
```

### Running tests

```bash
cd backend
uv run pytest -x -v
# Expected: 5 tenancy isolation tests pass today; CI (Stage 1) adds fabric-lot/roll and auth coverage on top.
```

### API Endpoints

**Auth**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register-tenant` | Create tenant + admin user, returns JWT |
| `POST` | `/api/v1/auth/login` | Login, returns JWT |
| `GET` | `/api/v1/auth/me` | Current user info (requires auth) |

**Fabric Lots**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/fabric-lots` | List all lots (tenant-scoped) |
| `POST` | `/api/v1/fabric-lots` | Create lot |
| `GET` | `/api/v1/fabric-lots/{id}` | Get lot by ID |
| `PATCH` | `/api/v1/fabric-lots/{id}` | Update lot |
| `DELETE` | `/api/v1/fabric-lots/{id}` | Soft-delete lot |
| `GET` | `/api/v1/fabric-lots/{id}/summary` | Roll count + meters by status |

**Fabric Rolls**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/fabric-rolls` | List all rolls (tenant-scoped) |
| `GET` | `/api/v1/fabric-rolls/{id}` | Get roll by ID |
| `PATCH` | `/api/v1/fabric-rolls/{id}` | Update roll |
| `DELETE` | `/api/v1/fabric-rolls/{id}` | Soft-delete roll |
| `GET` | `/api/v1/fabric-lots/{lotId}/rolls` | Rolls for a specific lot |
| `POST` | `/api/v1/fabric-lots/{lotId}/rolls` | Add roll to lot |

### Architecture

**Multi-tenancy via PostgreSQL RLS:** every table has a `tenant_id` column and an RLS policy. The FastAPI `get_db` dependency sets `SET LOCAL app.tenant_id = '<id>'` at the start of each request transaction, scoping all queries automatically — tenants are isolated at the database level, not just the service layer.

**JWT Auth:** login returns a signed JWT with `user_id`, `tenant_id`, `role`, and `plan`. Every protected endpoint depends on `get_current_tenant_id`, which decodes the JWT and passes the tenant ID to `get_db`.

**Frontend:** Next.js App Router with a `(dashboard)` route group for protected pages; token stored in localStorage plus a JS cookie; middleware redirects unauthenticated users to `/login`.

---

## Contributing

Issues and PRs are welcome. Before opening a PR: run `uv run pytest -x -v` in `backend/` and `npm run build` in `frontend/` — both must pass (the CI workflow runs the same checks). See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full guide and [`SPEC-ERP.md`](./SPEC-ERP.md) for the authoritative spec behind any change to schema, API contract, or frontend routes.

---

Built by **Asadullah Shafique**

🔗 Explore my portfolio — Agentic AI projects and real-world applications: [asadullahshafique-devunity.vercel.app](https://asadullahshafique-devunity.vercel.app)

## License

MIT — see [LICENSE](./LICENSE).
