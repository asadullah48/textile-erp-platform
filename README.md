# Textile ERP Platform

[![CI](https://github.com/asadullah48/textile-erp-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/asadullah48/textile-erp-platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Python 3.13](https://img.shields.io/badge/Python-3.13-green.svg)](https://www.python.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

**Multi-tenant ERP for Pakistan's textile mills.** Module 1 — Fabric Mill — is complete: the roll register, yarn stock book and LC file, in one system where the numbers can't drift.

**▶ Live demo: [textile-erp-platform.vercel.app](https://textile-erp-platform.vercel.app)** — no sign-up. A seeded Faisalabad mill; switch roles (owner / manager / operator / accountant) and watch permissions change.

*[Specification](./SPEC-ERP.md) · [Roadmap](./ROADMAP.md) · [Module 1 reference](./docs/MODULE-1.md) · [Deployment](./docs/DEPLOY.md)*

---

## Why

Fabric mills in Faisalabad, Gujranwala and Karachi run on Excel roll registers, paper yarn books and WhatsApp. The failure modes are specific: a roll issued twice, yarn stock that exists only on paper, an LC shipment sitting at Karachi port accruing demurrage because nobody noticed it cleared. Module 1 digitises exactly those three records and makes the database — not staff discipline — enforce their invariants.

## What's in Module 1

| Capability | What it does | Enforced by |
|---|---|---|
| **Lots & rolls** | Receive a lot, bulk-register a delivery (24 rolls in one step), issue whole or partial rolls to cutting / stitching / dyeing | Row lock on issue — two supervisors can't over-issue the same roll (mutation-tested) |
| **Yarn stock ledger** | Receipts, issues, wastage, adjustments with a running balance per entry | Append-only ledger, strict sequence, `CHECK (stock >= 0)`, stock not directly editable |
| **Weaving & knitting** | Shift logs: loom/machine, operator, picks/ends or gauge, output, grade | Logging a shift posts its yarn consumption in the same transaction — all or nothing |
| **LC imports** | LC opened → cleared → warehoused, then one click opens a valued lot split into rolls | Landed cost computed server-side; forward-only status; costs lock once the lot is valued |
| **Roll traceability** | Supplier / LC → looms and operators → every issue to the floor; printable QR roll labels | Only sessions dated on or before the roll was registered can appear in its history |
| **Mill Pulse** | 7 deterministic alert rules: yarn below reorder, yarn runway, dead stock, LC overdue, port demurrage risk, loom quality drift, uncosted stock | Plain thresholds over the tenant's own data; every alert carries the evidence that fired it. No LLM. |
| **Reports** | Stock valuation by category, fabric flow by department, production quality, reorder list, roll-stock CSV | Computed from the ledger, never typed in |
| **Team & roles** | Owner, manager, operator, accountant | `require_permission` on every endpoint; the UI only mirrors it |

## Architecture

```
Browser ──► Next.js 15 (App Router, TypeScript strict)
              │  NEXT_PUBLIC_DEMO_MODE=browser → in-browser API adapter (public demo)
              │  otherwise                     → HTTPS
              ▼
           FastAPI (async) ── TenancyMiddleware: JWT → tenant, user, role
              │                 require_permission(...) per route
              ▼
           PostgreSQL 16 ── Row-Level Security, FORCE, on every tenant table
                            set_config('app.tenant_id', …, is_local) per transaction
```

**Tenant isolation lives in PostgreSQL, not in application code.** Every tenant table has a `tenant_isolation` policy; each request transaction is scoped with a bound `set_config`. A query with no `WHERE tenant_id` still sees only its own tenant's rows — a test proves it with raw SQL.

**The API connects as a least-privilege role.** Superusers and `BYPASSRLS` roles ignore RLS even with `FORCE`, so migrations run as the schema owner and the app as a `NOSUPERUSER NOBYPASSRLS` role (`backend/scripts/create_app_role.sql`). The app logs `CRITICAL` at startup if its role could bypass RLS, `/health/ready` reports `rls_enforced`, and a test fails CI if it ever does.

**Login without bypassing RLS.** Before a tenant is known, login needs one lookup: which tenant does this user belong to? Rather than a privileged connection, a narrow `self_membership` policy lets a transaction read *its own user's* memberships once `app.user_id` is set — and it is set only after the password check.

### The public demo costs nothing to host

The deployed demo runs the frontend alone. With `NEXT_PUBLIC_DEMO_MODE=browser`, an axios adapter (`frontend/src/lib/demo/`) serves every API route from the browser — same routes, status codes and error shapes — backed by a port of the backend's business rules and seeded through them, persisted to `localStorage`. The same UI, pointed at the real FastAPI stack, produces identical Mill Pulse figures (verified). Pointing it at a real backend is one environment variable; see [docs/DEPLOY.md](./docs/DEPLOY.md).

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 (async), asyncpg, Alembic, Pydantic v2 |
| Auth | JWT (`python-jose`), bcrypt, role → permission map |
| Database | PostgreSQL 16, Row-Level Security |
| Frontend | Next.js 15, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui (base-ui) |
| Tests & CI | pytest (42 tests against real Postgres), Playwright smoke runs, GitHub Actions |
| Hosting | Vercel (frontend demo). Backend: Docker image, any container host — see deploy guide |

## Run it locally

### Docker Compose (full stack)

```bash
git clone https://github.com/asadullah48/textile-erp-platform.git
cd textile-erp-platform
cp .env.example .env          # set POSTGRES_PASSWORD, APP_DB_PASSWORD, SECRET_KEY
docker compose up --build
# App http://localhost:3000 · API docs http://localhost:8000/docs
# "Try a private demo workspace" on /login seeds an isolated mill for you
```

Compose creates the least-privilege app role on first start, runs migrations as the owner and serves the API as the app role.

### Manual

```bash
# backend  (requires uv and a local PostgreSQL 16)
cd backend && uv sync --extra test
export MIGRATIONS_DATABASE_URL=postgresql+asyncpg://owner:pw@localhost/textile_erp
psql "postgresql://owner:pw@localhost/textile_erp" -v app_user=textile_app -v app_password=app_pw -f scripts/create_app_role.sql
export DATABASE_URL=postgresql+asyncpg://textile_app:app_pw@localhost/textile_erp SECRET_KEY=$(openssl rand -hex 32)
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# frontend
cd frontend && npm ci && npm run dev                      # against the local API
NEXT_PUBLIC_DEMO_MODE=browser npm run dev                  # or: browser demo, no backend
```

### Tests

```bash
cd backend && uv run pytest -v      # 42 tests, real PostgreSQL, run as the app role
cd frontend && npm run typecheck && npm run build
```

Coverage highlights: cross-tenant 404s on every resource; RLS on raw SQL with no `WHERE`; a concurrent double-issue race (fails if the row lock is removed); yarn ledger balances and negative-stock rejection; atomic yarn posting from production; landed-cost arithmetic and LC lifecycle; RBAC per role; demo seeding fires all 7 Mill Pulse rules; demo purge; trace chronology.

## API

Interactive docs at `/docs`. Summary in [docs/MODULE-1.md](./docs/MODULE-1.md#api). Authentication: `POST /api/v1/auth/login`, `POST /api/v1/auth/register-tenant`, or `POST /api/v1/auth/demo` for an isolated, pre-seeded demo workspace that is purged after 24 hours.

## Status — what is real and what is planned

| | Status |
|---|---|
| Module 1 — Fabric Mill (this README) | **Complete.** Backend, frontend, tests, CI, public demo |
| Production backend hosting | **Not running.** Deliberately — no paying customer yet. Docker image and deploy guide are ready |
| Module 2 — CMT order lifecycle & auto-billing | Specced in `SPEC-ERP.md` §7, not built |
| Modules 3–5 — BOM, party ledgers, financials | Specced, not built |
| SaaS billing (Stripe, JazzCash, EasyPaisa, Meezan) | Specced, not built |

Known and accepted: `npm audit --omit=dev` reports two advisories in the PostCSS copy bundled inside Next.js; it processes only this repo's own CSS at build time, and the fix requires the Next 16 major.

## Contributing

Run `uv run pytest -v` and `npm run build` before a PR — CI runs the same. See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

Built by **Asadullah Shafique** — [portfolio](https://asadullahshafique-devunity.vercel.app) · MIT licensed. Demo data and business names are fictional.
