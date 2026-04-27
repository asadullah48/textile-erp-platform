# SPEC-ERP.md — Pakistan Textile ERP Platform
## Authoritative Product Specification · Version 1.0 · 2026-04-25

> This document is the single source of truth for the **textile-erp-platform** build. All implementation decisions, database schemas, API contracts, and frontend routes derive from this spec. Resolve any ambiguity by returning here first.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Repository Structure](#3-repository-structure)
4. [Multi-Tenancy Design](#4-multi-tenancy-design)
5. [Authentication & RBAC](#5-authentication--rbac)
6. [Module 1 — Fabric Mill](#6-module-1--fabric-mill)
7. [Module 2 — CMT Order Lifecycle](#7-module-2--cmt-order-lifecycle)
8. [Module 3 — Inventory & BOM](#8-module-3--inventory--bom)
9. [Module 4 — Party Ledgers](#9-module-4--party-ledgers)
10. [Module 5 — Financial Accounts](#10-module-5--financial-accounts)
11. [SaaS Billing & Subscriptions](#11-saas-billing--subscriptions)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Session Plan (4 × 3 hours)](#13-session-plan-4--3-hours)
14. [Migration Strategy from CMT PoC](#14-migration-strategy-from-cmt-poc)

---

## 1. Product Overview

### 1.1 Vision

Pakistan's first multi-tenant textile ERP SaaS — purpose-built for the full value chain from raw fibre to finished export. Mobile-first, Urdu-ready, and Islamic-finance compliant.

The platform collapses the five core pain points of Pakistan's textile SME sector:

| Pain Point | Platform Solution |
|-----------|------------------|
| Manual roll/lot registers in Excel | Digital Fabric Mill module with roll-level tracking |
| Verbal CMT order records | Structured order lifecycle with auto-billing |
| No real-time inventory visibility | Live BOM consumption against production |
| Ledgers maintained in notebooks | Digital party ledgers with aging reports |
| No P&L until year-end accountant visit | Real-time P&L per order and monthly |

### 1.2 Target Markets

| City | Textile Segment | Primary Modules |
|------|----------------|-----------------|
| Faisalabad | Fabric mills, weaving units, power-loom clusters | Fabric Mill (M1) |
| Sialkot | Sportswear CMT exporters, surgical gloves, leather | CMT Orders (M2) |
| Gujranwala | Knitwear manufacturers, hosiery | Fabric Mill + CMT |
| Karachi | Garment exporters, composite mills, denim | All modules |
| Lahore | Fashion brands, boutique labels, retail chains | CMT + Inventory |
| UAE / Dubai | Pakistani-owned export houses, buying agents | All modules, USD billing |

### 1.3 Business Model — Subscription Tiers

All paid plans include a **14-day free trial**. No credit card required to start trial.

| Feature | Free | Pro | Business | Enterprise |
|---------|------|-----|----------|-----------|
| **Price (PKR/month)** | — | 4,999 | 12,999 | Custom |
| **Price (USD/month)** | — | ~28 | ~72 | Custom |
| **Users** | 1 | 5 | Unlimited | Custom |
| **Orders/month** | 50 | Unlimited | Unlimited | Custom |
| Fabric Mill module | — | ✓ | ✓ | ✓ |
| CMT module | ✓ | ✓ | ✓ | ✓ |
| Inventory & BOM | — | ✓ | ✓ | ✓ |
| Party ledgers | Basic view | Full + CSV | Full + CSV + Excel | Full |
| Financial reports | — | Basic (cash position) | Full (P&L, Balance Sheet) | Full |
| P&L per order | — | — | ✓ | ✓ |
| Balance sheet | — | — | ✓ | ✓ |
| PDF export (invoices) | — | ✓ | ✓ | ✓ |
| Excel export (reports) | — | — | ✓ | ✓ |
| PWA mobile access | ✓ | ✓ | ✓ | ✓ |
| Priority email support | — | — | ✓ | ✓ |
| Custom branding/logo | — | — | — | ✓ |
| REST API access | — | — | — | ✓ |
| Dedicated support rep | — | — | — | ✓ |
| SLA uptime guarantee | — | — | 99% | 99.9% |
| Data retention | 90 days | 2 years | 5 years | Unlimited |

**Billing currencies:**
- PKR — Pakistan-based tenants (default)
- USD — UAE/international tenants (set at tenant registration; immutable thereafter)

**Payment gateways:** Stripe (cards, international) · JazzCash · EasyPaisa · Meezan Bank Ameen (Islamic, no riba). All four gateways sit behind a `PaymentProvider` protocol — see §11.

### 1.4 Success Metrics

| Metric | Target |
|--------|--------|
| API p95 latency | < 500ms |
| API p99 latency | < 1,000ms |
| Uptime (Business tier) | 99% monthly |
| Uptime (Enterprise tier) | 99.9% monthly |
| Cross-tenant data leakage | Zero — enforced at PostgreSQL RLS layer |
| Data loss | Zero — Neon PITR 7-day retention on Pro+ |
| Time-to-onboard | < 10 minutes (wizard-driven setup) |
| Free-to-paid conversion | Target 8% within 30 days of trial |
| Monthly churn | Target < 3% |

---

## 2. Architecture Overview

### 2.1 Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Frontend framework | Next.js | 15.x | App Router, Turbopack |
| Frontend runtime | React | 19.x | Server + Client components |
| Frontend language | TypeScript | 5.x | Strict mode |
| CSS framework | Tailwind CSS | 4.x | PostCSS plugin |
| UI components | shadcn/ui | 4.x | Radix primitives |
| State management | React Context + useReducer | — | No Redux/Zustand |
| HTTP client | Axios | 1.x | Interceptors for auth + tenant |
| Backend framework | FastAPI | 0.116+ | Async routes |
| Backend language | Python | 3.13+ | |
| ORM | SQLAlchemy | 2.0+ | Declarative, async sessions |
| Schema validation | Pydantic | 2.x | Strict mode for financials |
| Database | PostgreSQL (Neon) | 16 | Serverless, auto-scale |
| Migrations | Alembic | 1.16+ | Append-only, absolute paths |
| Auth | JWT (python-jose) | — | RS256 in prod, HS256 in dev |
| Password hashing | bcrypt | 4.x | Direct import (not passlib) |
| Backend pkg manager | uv | latest | Never use pip install |
| Frontend pkg manager | npm | — | |
| PDF generation | reportlab | 4.x | Backend generates, streams |
| Excel generation | openpyxl | 3.x | Styled headers, freeze panes |
| PWA | next-pwa | 5.x | Workbox-based service worker |
| i18n | next-intl | 3.x | Urdu/RTL Phase 2 |

### 2.2 Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Global Edge (Vercel)               │
│  Next.js frontend · CDN-cached static assets · PWA  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│             FastAPI Backend (Koyeb)                  │
│  Frankfurt region · Auto-scale · JWT validation      │
│  Tenancy middleware · RLS context · Rate limiting    │
└──────────────────────┬──────────────────────────────┘
                       │ TLS + Connection pooling
┌──────────────────────▼──────────────────────────────┐
│          PostgreSQL — Neon Serverless                 │
│  Row-Level Security on all tenant tables             │
│  Composite indexes on (tenant_id, id) everywhere    │
│  PITR 7-day retention (Pro+)                         │
└─────────────────────────────────────────────────────┘
```

### 2.3 Design Principles

1. **Thin routes, fat services.** All business logic lives in `services/`. Routes are 10-line wrappers.
2. **RLS as the last line of defence.** Even if app-layer tenant check is bypassed, Postgres RLS blocks cross-tenant reads.
3. **Append-only migrations.** Never edit or squash existing Alembic migrations. New changes = new migration file.
4. **Soft deletes everywhere.** `is_deleted + deleted_at` on every tenant model. Queries always filter `is_deleted == False`.
5. **Atomic balance updates.** Use `SELECT ... FOR UPDATE` locks when modifying party balances to prevent race conditions.
6. **YAGNI strictly enforced.** No speculative features. Each session delivers exactly what's in §13.

---

## 3. Repository Structure

```
D:\textile-erp-platform\
├── SPEC-ERP.md                  ← this document (authoritative)
├── README.md                    ← setup + quick start
├── CLAUDE.md                    ← locked conventions for AI assistants
├── AGENTS.md                    ← full architecture reference (generated after Session 1)
│
├── backend/
│   ├── pyproject.toml           ← uv-managed, Python 3.13+
│   ├── uv.lock
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py               ← normalises asyncpg:// → psycopg2://
│   │   └── versions/            ← append-only migration files
│   └── app/
│       ├── main.py              ← FastAPI app, middleware registration, router inclusion
│       ├── core/
│       │   ├── config.py        ← Pydantic Settings (DATABASE_URL, SECRET_KEY, etc.)
│       │   ├── database.py      ← SQLAlchemy engine, session factory, get_db dependency
│       │   ├── security.py      ← JWT encode/decode (RS256 prod / HS256 dev), bcrypt
│       │   ├── dependencies.py  ← CurrentUser, RequireRole, FeatureFlag dependencies
│       │   ├── middleware/
│       │   │   ├── tenancy.py   ← sets app.tenant_id Postgres session variable
│       │   │   └── rate_limit.py← per-tenant rate limiting by plan tier
│       │   └── permissions.py   ← role × feature permission matrix
│       ├── models/
│       │   ├── base.py          ← TenantBaseModel (tenant_id, UUID PK, timestamps, soft delete)
│       │   ├── tenant.py        ← Tenant, User, TenantUser
│       │   ├── subscription.py  ← SubscriptionPlan, TenantSubscription, UsageRecord, PaymentRecord
│       │   ├── fabric.py        ← Module 1: all Fabric Mill models
│       │   ├── cmt/
│       │   │   ├── orders.py
│       │   │   ├── bills.py
│       │   │   ├── production.py
│       │   │   ├── parties.py
│       │   │   ├── inventory.py
│       │   │   ├── financial.py
│       │   │   ├── quality.py
│       │   │   ├── overhead.py
│       │   │   ├── products.py
│       │   │   ├── todos.py
│       │   │   └── share_links.py
│       │   ├── ledger.py        ← FabricPurchaseLedger
│       │   └── audit.py         ← AuditLog (tenant-scoped)
│       ├── schemas/             ← Pydantic v2 request/response models (mirror models/)
│       │   ├── auth.py
│       │   ├── tenant.py
│       │   ├── subscription.py
│       │   ├── fabric.py
│       │   ├── cmt/
│       │   └── finance.py
│       ├── services/
│       │   ├── tenant_service.py
│       │   ├── fabric_service.py
│       │   ├── ledger_service.py
│       │   ├── finance_service.py
│       │   ├── cmt/
│       │   │   ├── order_service.py
│       │   │   ├── bill_service.py
│       │   │   ├── auto_bill_service.py
│       │   │   ├── financial_service.py
│       │   │   ├── production_service.py
│       │   │   ├── quality_service.py
│       │   │   └── dashboard_service.py
│       │   └── payment/
│       │       ├── provider.py          ← PaymentProvider Protocol + factory
│       │       ├── stripe_provider.py
│       │       ├── jazzcash_provider.py
│       │       ├── easypaysa_provider.py
│       │       └── meezan_provider.py
│       ├── api/
│       │   └── v1/
│       │       ├── router.py            ← aggregates all sub-routers
│       │       └── endpoints/
│       │           ├── auth.py
│       │           ├── tenants.py
│       │           ├── subscriptions.py
│       │           ├── webhooks.py      ← all gateway IPN/webhook handlers
│       │           ├── fabric/
│       │           │   ├── suppliers.py
│       │           │   ├── lots.py
│       │           │   ├── rolls.py
│       │           │   ├── yarn.py
│       │           │   ├── weaving.py
│       │           │   ├── knitting.py
│       │           │   └── imports.py
│       │           ├── cmt/
│       │           │   ├── orders.py
│       │           │   ├── bills.py
│       │           │   ├── production.py
│       │           │   ├── dispatch.py
│       │           │   ├── parties.py
│       │           │   ├── quality.py
│       │           │   ├── inventory.py
│       │           │   ├── products.py
│       │           │   ├── overhead.py
│       │           │   ├── todos.py
│       │           │   ├── settings.py
│       │           │   └── share_links.py
│       │           ├── ledger.py
│       │           ├── finance.py
│       │           └── dashboard.py
│       └── tests/
│           ├── conftest.py              ← fixtures: two isolated test tenants
│           ├── test_tenancy_isolation.py
│           ├── test_fabric_module.py
│           ├── test_cmt_lifecycle.py
│           ├── test_ledger.py
│           ├── test_finance.py
│           └── test_subscription.py
│
└── frontend/
    ├── package.json
    ├── next.config.ts               ← next-pwa config
    ├── tsconfig.json
    ├── postcss.config.mjs
    ├── public/
    │   ├── manifest.json            ← PWA manifest
    │   └── icons/
    │       ├── icon-192.png
    │       └── icon-512.png
    └── src/
        ├── app/
        │   ├── layout.tsx           ← root layout, fonts, PWA meta
        │   ├── globals.css          ← Tailwind v4, sidebar navy #1a2744
        │   ├── middleware.ts        ← route protection, tenant header injection
        │   ├── page.tsx             ← redirect → /dashboard
        │   ├── (auth)/
        │   │   ├── layout.tsx
        │   │   ├── login/page.tsx
        │   │   ├── register/page.tsx         ← tenant + owner creation
        │   │   └── forgot-password/page.tsx
        │   ├── onboarding/page.tsx           ← 3-step wizard: org → team → plan
        │   ├── billing/
        │   │   ├── plans/page.tsx
        │   │   ├── checkout/page.tsx         ← gateway selection + payment
        │   │   ├── success/page.tsx
        │   │   └── manage/page.tsx           ← current plan, invoices, upgrade
        │   ├── (dashboard)/
        │   │   ├── layout.tsx                ← sidebar + tenant context provider
        │   │   ├── dashboard/page.tsx
        │   │   ├── fabric-mill/
        │   │   │   ├── page.tsx              ← stock overview cards
        │   │   │   ├── lots/
        │   │   │   │   ├── page.tsx
        │   │   │   │   └── [id]/page.tsx     ← lot detail + rolls table
        │   │   │   ├── rolls/page.tsx
        │   │   │   ├── yarn/page.tsx         ← yarn stock + transaction history
        │   │   │   ├── weaving/page.tsx
        │   │   │   ├── knitting/page.tsx
        │   │   │   ├── imports/page.tsx      ← LC/shipment tracking
        │   │   │   ├── suppliers/page.tsx
        │   │   │   └── reports/page.tsx
        │   │   ├── orders/page.tsx           ← CMT orders list
        │   │   ├── orders/[id]/page.tsx
        │   │   ├── orders/[id]/jobcard/page.tsx
        │   │   ├── bills/
        │   │   │   ├── page.tsx
        │   │   │   ├── new/page.tsx
        │   │   │   └── [id]/page.tsx
        │   │   ├── parties/
        │   │   │   ├── page.tsx
        │   │   │   └── [id]/page.tsx
        │   │   ├── production/page.tsx
        │   │   ├── quality/page.tsx
        │   │   ├── dispatch/page.tsx
        │   │   ├── inventory/page.tsx
        │   │   ├── products/page.tsx
        │   │   ├── overhead/page.tsx
        │   │   ├── todos/page.tsx
        │   │   ├── ledger/
        │   │   │   ├── page.tsx
        │   │   │   ├── aging/page.tsx
        │   │   │   └── parties/[id]/page.tsx
        │   │   ├── finance/
        │   │   │   ├── pl/page.tsx
        │   │   │   ├── balance-sheet/page.tsx
        │   │   │   └── cash-flow/page.tsx
        │   │   └── settings/
        │   │       ├── page.tsx              ← rate templates, thresholds
        │   │       ├── users/page.tsx        ← team management
        │   │       ├── subscription/page.tsx ← current plan + billing
        │   │       └── profile/page.tsx
        │   └── share/[token]/page.tsx        ← public bill share (no auth)
        ├── components/
        │   ├── ui/                           ← shadcn primitives
        │   ├── fabric/                       ← Fabric Mill components
        │   ├── cmt/                          ← migrated CMT components
        │   ├── ledger/
        │   ├── finance/
        │   └── common.tsx                    ← Spinner, Badge, Card, Table, etc.
        └── hooks/
            ├── services.ts                   ← axios API client + all API call functions
            ├── types.ts                      ← TypeScript interfaces for all entities
            ├── utils.ts                      ← cn(), formatting, validation helpers
            ├── store.tsx                     ← React Context: auth state + tenant context
            └── toast.tsx                     ← Toast notification context
```

---

## 4. Multi-Tenancy Design

### 4.1 Isolation Model

Row-Level Security (RLS) enforced at the PostgreSQL layer. Every tenant-scoped table has a `tenant_id` column and an RLS policy that limits all queries to the current tenant. The FastAPI middleware injects the tenant ID into the Postgres session before each request. Even if application code is buggy or bypassed, the database itself prevents cross-tenant reads.

### 4.2 TenantBaseModel

All tenant-scoped tables inherit from `TenantBaseModel`. Tables belonging to the global admin domain (e.g., `tenants`, `users`, `subscription_plans`) inherit from plain `Base`.

```python
# backend/app/models/base.py
from uuid import uuid4
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, declared_attr
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class TenantBaseModel(Base):
    __abstract__ = True

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
```

### 4.3 Composite Indexes

Every tenant-scoped table gets a composite index on `(tenant_id, id)` and additional indexes on common filter columns. This ensures all tenant-scoped queries use index scans, not sequential scans.

```sql
-- Pattern applied to every tenant table in Alembic migration:
CREATE INDEX idx_{table}_tenant ON {table}(tenant_id, id);

-- Applied to (complete list):
-- fabric_suppliers, fabric_lots, fabric_rolls, yarn_types, yarn_transactions,
-- weaving_sessions, knitting_sessions, imported_fabrics, fabric_issuances,
-- fabric_purchase_ledger,
-- cmt_orders, cmt_order_items, cmt_parties, cmt_bills, cmt_bill_rate_templates,
-- cmt_order_accessories, cmt_production_sessions, cmt_financial_transactions,
-- cmt_inventory_categories, cmt_inventory_items, cmt_inventory_transactions,
-- cmt_quality_checkpoints, cmt_defect_logs, cmt_cash_accounts, cmt_cash_entries,
-- cmt_overhead_expenses, cmt_expenses, cmt_todos, cmt_share_links, cmt_audit_logs,
-- cmt_products, cmt_product_bom_items, usage_records, payment_records
```

### 4.4 PostgreSQL RLS Policies

Applied in Alembic migration for every tenant-scoped table:

```sql
-- Enable RLS
ALTER TABLE fabric_rolls ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (reads and writes)
CREATE POLICY tenant_isolation ON fabric_rolls
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Allow superuser (migration runner) to bypass RLS
ALTER TABLE fabric_rolls FORCE ROW LEVEL SECURITY;

-- The second argument `true` in current_setting makes it return NULL
-- instead of raising an error when app.tenant_id is not set.
-- This allows migrations to run without the tenant context.
```

### 4.5 FastAPI Tenancy Middleware

```python
# backend/app/core/middleware/tenancy.py
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import text
from app.core.security import decode_jwt
from app.core.database import async_session_factory

# Paths that bypass tenant context (auth endpoints, webhook handlers, public share links)
EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register-tenant",
    "/api/v1/webhooks/stripe",
    "/api/v1/webhooks/jazzcash",
    "/api/v1/webhooks/easypaysa",
    "/api/v1/webhooks/meezan",
    "/api/v1/share-links/",  # prefix match
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
}

class TenancyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if any(request.url.path.startswith(p) for p in EXEMPT_PATHS):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing auth token")

        token = auth_header.replace("Bearer ", "")
        payload = decode_jwt(token)  # raises 401 if expired/invalid
        tenant_id = payload.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=401, detail="No tenant context in token")

        # Inject tenant_id into Postgres session for RLS
        request.state.tenant_id = tenant_id
        request.state.user_id = payload.get("sub")
        request.state.role = payload.get("role")

        # The actual SET app.tenant_id is done inside get_db() dependency
        # using the request.state values
        return await call_next(request)
```

### 4.6 JWT Token Structure

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "role": "manager",
  "plan": "pro",
  "exp": 1782345600,
  "iat": 1782316800
}
```

- Algorithm: **RS256** in production (asymmetric), **HS256** in development
- Expiry: 480 minutes (8 hours)
- No refresh token in v1 — re-login on expiry
- The `plan` claim is informational; feature-flag enforcement is server-side against the database

### 4.7 Tenant-Aware Database Dependency

```python
# backend/app/core/database.py (relevant excerpt)
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from fastapi import Request

engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

async def get_db(request: Request):
    async with async_session_factory() as session:
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            await session.execute(text(f"SET LOCAL app.tenant_id = '{tenant_id}'"))
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

---

## 5. Authentication & RBAC

### 5.1 Registration Flow

Tenant registration is a single atomic operation — org record + owner user + free subscription created together:

```
POST /api/v1/auth/register-tenant
Body: {
  "org_name": "Faisal Textiles Ltd",
  "slug": "faisal-textiles",           # auto-generated from org_name if omitted
  "industry": "fabric_mill",           # fabric_mill | cmt | export_house | brand
  "city": "Faisalabad",
  "country": "PK",                     # PK | AE
  "currency": "PKR",                   # PKR | USD
  "full_name": "Muhammad Faisal",
  "email": "faisal@example.com",
  "password": "..."
}
Response: { "access_token": "...", "user": {...}, "tenant": {...} }
```

The endpoint:
1. Creates `Tenant` record
2. Creates `User` record (bcrypt hashed password)
3. Creates `TenantUser` record with `role = "owner"`
4. Creates `TenantSubscription` with `plan = "free"` and no trial
5. Returns JWT with `tenant_id` + `role = "owner"` claim

### 5.2 Roles

| Role | Pakistani Context | Capabilities |
|------|-----------------|--------------|
| **owner** | Factory maalik (owner) | Full access including billing, user management, audit logs, all financials |
| **manager** | Supervisor / production manager | All operational + financial access. Cannot manage users or billing |
| **operator** | Floor supervisor, dispatch clerk, data entry | Create/update orders, log production, update dispatch, quality checks. No financial data |
| **accountant** | Munshi / accountant | Read-only on orders and production. Full access to bills, payments, ledgers, financial reports |

### 5.3 Permission Matrix

| Feature | owner | manager | operator | accountant |
|---------|-------|---------|---------|-----------|
| User management (invite/remove/role change) | ✓ | — | — | — |
| Subscription & billing settings | ✓ | — | — | — |
| Audit logs | ✓ | — | — | — |
| Tenant settings (name, city, currency) | ✓ | ✓ | — | — |
| **Fabric Mill** | | | | |
| Fabric Mill — view (lots, rolls, yarn, stock) | ✓ | ✓ | ✓ | ✓ |
| Fabric Mill — create/edit (lots, rolls, yarn, sessions) | ✓ | ✓ | ✓ | — |
| Imported fabric (LC tracking) | ✓ | ✓ | ✓ | ✓ |
| Fabric supplier management | ✓ | ✓ | — | — |
| **CMT Orders** | | | | |
| CMT Orders — view | ✓ | ✓ | ✓ | ✓ |
| CMT Orders — create/edit | ✓ | ✓ | ✓ | — |
| Production sessions — log | ✓ | ✓ | ✓ | — |
| Quality checkpoints | ✓ | ✓ | ✓ | — |
| Dispatch — update carrier/tracking | ✓ | ✓ | ✓ | — |
| **Billing & Finance** | | | | |
| Bills — view | ✓ | ✓ | — | ✓ |
| Bills — create/edit | ✓ | ✓ | — | ✓ |
| Payments — record | ✓ | ✓ | — | ✓ |
| Bill rate templates — edit | ✓ | ✓ | — | — |
| Party ledgers — view | ✓ | ✓ | — | ✓ |
| Party ledgers — record supplier payment | ✓ | ✓ | — | ✓ |
| Aging report | ✓ | ✓ | — | ✓ |
| P&L report | ✓ | ✓ | — | ✓ |
| Balance sheet | ✓ | ✓ | — | ✓ |
| Cash flow | ✓ | ✓ | — | ✓ |
| Overhead expenses — view | ✓ | ✓ | — | ✓ |
| Overhead expenses — create/edit | ✓ | ✓ | — | ✓ |
| Cash accounts | ✓ | ✓ | — | ✓ |
| **Inventory** | | | | |
| Inventory — view | ✓ | ✓ | ✓ | — |
| Inventory — adjust stock | ✓ | ✓ | ✓ | — |
| Products & BOM | ✓ | ✓ | — | — |

### 5.4 Implementation Pattern

```python
# backend/app/core/dependencies.py
from fastapi import Depends, HTTPException, Request
from app.core.permissions import PERMISSIONS

def require_permission(feature: str):
    def dependency(request: Request):
        role = request.state.role
        if not PERMISSIONS.get(feature, {}).get(role, False):
            raise HTTPException(403, f"Role '{role}' cannot access '{feature}'")
    return Depends(dependency)

# Usage in routes:
@router.post("/fabric/lots")
async def create_lot(
    body: FabricLotCreate,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("fabric_write"),
):
    ...
```

---

## 6. Module 1 — Fabric Mill

### 6.1 Overview

The Fabric Mill module is the primary differentiator for Faisalabad and Gujranwala customers. It digitises the physical roll register, yarn stock book, and LC file that every mill supervisor currently maintains on paper.

### 6.2 Database Models

```python
# backend/app/models/fabric.py

class FabricSupplier(TenantBaseModel):
    """Suppliers of fabric, yarn, or raw materials."""
    __tablename__ = "fabric_suppliers"

    name = Column(String(200), nullable=False)
    contact_person = Column(String(100))
    phone = Column(String(20))
    email = Column(String(255))
    address = Column(Text)
    country = Column(String(2), default="PK")       # ISO 2-letter
    payment_terms = Column(String(100))              # "Net 30", "Advance", "60 days LC"
    balance = Column(Numeric(12, 2), default=0)      # outstanding payable (positive = we owe them)
    notes = Column(Text)


class FabricLot(TenantBaseModel):
    """
    A batch/lot of fabric received or produced. A lot contains one or more rolls.
    For imported fabric, one lot typically corresponds to one LC/shipment.
    """
    __tablename__ = "fabric_lots"
    __table_args__ = (
        UniqueConstraint("tenant_id", "lot_number"),
        Index("idx_fabric_lots_tenant", "tenant_id", "id"),
        Index("idx_fabric_lots_status", "tenant_id", "status"),
    )

    lot_number = Column(String(50), nullable=False)
    fabric_category = Column(String(20), nullable=False)  # woven | knitted | imported | yarn_fabric
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("fabric_suppliers.id"), nullable=False)
    received_date = Column(Date, nullable=False)
    total_rolls = Column(Integer, nullable=False, default=0)
    total_weight_kg = Column(Numeric(10, 3), nullable=False, default=0)
    notes = Column(Text)
    status = Column(String(20), default="active")   # active | partial | consumed

    # Relationships
    supplier = relationship("FabricSupplier")
    rolls = relationship("FabricRoll", back_populates="lot")


class FabricRoll(TenantBaseModel):
    """
    Individual roll of fabric. The fundamental unit of fabric inventory.
    Status transitions: available → reserved → issued → consumed
    """
    __tablename__ = "fabric_rolls"
    __table_args__ = (
        UniqueConstraint("tenant_id", "roll_number"),
        Index("idx_fabric_rolls_tenant", "tenant_id", "id"),
        Index("idx_fabric_rolls_lot_status", "tenant_id", "lot_id", "status"),
    )

    lot_id = Column(UUID(as_uuid=True), ForeignKey("fabric_lots.id"), nullable=False)
    roll_number = Column(String(50), nullable=False)
    fabric_type = Column(String(100), nullable=False)    # "100% Cotton Plain", "60/40 CVC Twill"
    width_inches = Column(Numeric(6, 2))                 # e.g. 58.0, 60.0
    weight_kg = Column(Numeric(8, 3), nullable=False)
    color = Column(String(100))                          # "Natural", "White", "#ECEFF1"
    composition = Column(String(200))                    # "60% Cotton 40% Polyester"
    warehouse_location = Column(String(50))              # "Rack A-3", "Bay 2"
    status = Column(String(20), default="available")     # available | reserved | issued | consumed
    cost_per_kg = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(12, 2), nullable=False)  # weight_kg × cost_per_kg (stored, not computed)

    # Relationships
    lot = relationship("FabricLot", back_populates="rolls")
    issuances = relationship("FabricIssuance", back_populates="roll")


class YarnType(TenantBaseModel):
    """
    A type/specification of yarn maintained in stock.
    current_stock_kg is denormalized and updated on every YarnTransaction.
    """
    __tablename__ = "yarn_types"
    __table_args__ = (
        Index("idx_yarn_types_tenant", "tenant_id", "id"),
    )

    yarn_count = Column(String(20), nullable=False)       # "20/1", "30/2", "40/1 OE"
    ply = Column(Integer, nullable=False, default=1)      # 1, 2, 3
    fiber_type = Column(String(50), nullable=False)       # cotton | polyester | blended | viscose | acrylic
    color_code = Column(String(20))                       # "Natural" or hex "#ECEFF1"
    color_name = Column(String(100))                      # "Optical White", "Raw White"
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("fabric_suppliers.id"))
    unit_cost_per_kg = Column(Numeric(10, 2), nullable=False)
    reorder_level_kg = Column(Numeric(10, 3), default=0)
    current_stock_kg = Column(Numeric(10, 3), default=0, nullable=False)  # denormalized
    notes = Column(Text)

    supplier = relationship("FabricSupplier")
    transactions = relationship("YarnTransaction", back_populates="yarn_type")


class YarnTransaction(TenantBaseModel):
    """
    Stock movement for a specific YarnType.
    quantity_kg is always positive; direction determined by transaction_type:
      receipt → adds to stock
      issue / wastage → deducts from stock
      adjustment → net change (positive or negative stored separately via signed field)
    """
    __tablename__ = "yarn_transactions"
    __table_args__ = (
        Index("idx_yarn_txn_tenant_type", "tenant_id", "yarn_type_id"),
        Index("idx_yarn_txn_date", "tenant_id", "transaction_date"),
    )

    yarn_type_id = Column(UUID(as_uuid=True), ForeignKey("yarn_types.id"), nullable=False)
    transaction_type = Column(String(20), nullable=False)  # receipt | issue | adjustment | wastage
    quantity_kg = Column(Numeric(10, 3), nullable=False)   # always positive
    direction = Column(String(3), nullable=False)          # "in" | "out"
    unit_cost = Column(Numeric(10, 2))
    total_cost = Column(Numeric(12, 2))
    order_reference = Column(String(50))                   # CMT order number (if issued to production)
    lot_reference = Column(String(50))                     # Fabric lot number (if used in weaving)
    transaction_date = Column(Date, nullable=False)
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    yarn_type = relationship("YarnType", back_populates="transactions")


class WeavingSession(TenantBaseModel):
    """
    Production session on a loom. Records what fabric a loom produced in a shift.
    Each session feeds into a FabricLot.
    """
    __tablename__ = "weaving_sessions"
    __table_args__ = (
        Index("idx_weaving_tenant_lot", "tenant_id", "lot_id"),
        Index("idx_weaving_date", "tenant_id", "session_date"),
    )

    lot_id = Column(UUID(as_uuid=True), ForeignKey("fabric_lots.id"), nullable=False)
    loom_number = Column(String(20), nullable=False)
    operator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_date = Column(Date, nullable=False)
    start_time = Column(Time)
    end_time = Column(Time)
    picks_per_inch = Column(Integer)                       # weft density
    ends_per_inch = Column(Integer)                        # warp density
    fabric_produced_meters = Column(Numeric(10, 2))
    fabric_produced_kg = Column(Numeric(10, 3))
    quality_grade = Column(String(1), default="A")        # A | B | C
    notes = Column(Text)

    lot = relationship("FabricLot")


class KnittingSession(TenantBaseModel):
    """
    Production session on a knitting machine. Records fabric produced from yarn.
    """
    __tablename__ = "knitting_sessions"
    __table_args__ = (
        Index("idx_knitting_tenant_yarn", "tenant_id", "yarn_type_id"),
        Index("idx_knitting_date", "tenant_id", "session_date"),
    )

    yarn_type_id = Column(UUID(as_uuid=True), ForeignKey("yarn_types.id"), nullable=False)
    machine_number = Column(String(20), nullable=False)
    operator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_date = Column(Date, nullable=False)
    gauge = Column(Integer)                               # needles per inch (e.g. 18, 24, 28)
    course_count = Column(Integer)                        # rows per cm
    fabric_produced_kg = Column(Numeric(10, 3), nullable=False)
    quality_grade = Column(String(1), default="A")
    notes = Column(Text)

    yarn_type = relationship("YarnType")


class ImportedFabric(TenantBaseModel):
    """
    Fabric imported via Letter of Credit or open account.
    Tracks LC → shipment → port clearance → warehouse → consumption lifecycle.
    total_landed_cost_pkr = (fob_cost × exchange_rate) + freight + insurance + duties
    """
    __tablename__ = "imported_fabrics"
    __table_args__ = (
        UniqueConstraint("tenant_id", "lc_number"),
        Index("idx_imported_fabric_tenant", "tenant_id", "id"),
        Index("idx_imported_fabric_status", "tenant_id", "status"),
    )

    lc_number = Column(String(50), nullable=False)
    shipment_reference = Column(String(50))              # Bill of Lading / AWB number
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("fabric_suppliers.id"), nullable=False)
    fabric_type = Column(String(100), nullable=False)
    quantity_meters = Column(Numeric(12, 2), nullable=False)
    quantity_kg = Column(Numeric(12, 3))
    currency = Column(String(3), nullable=False)         # USD | EUR | CNY | GBP
    fob_cost = Column(Numeric(12, 2), nullable=False)    # FOB cost in origin currency
    exchange_rate = Column(Numeric(10, 4), nullable=False)  # to PKR at clearance date
    freight_cost_pkr = Column(Numeric(12, 2), default=0)
    insurance_cost_pkr = Column(Numeric(12, 2), default=0)
    duties_paid_pkr = Column(Numeric(12, 2), default=0)
    total_landed_cost_pkr = Column(Numeric(14, 2), nullable=False)  # computed + stored
    port_of_entry = Column(String(50), default="Karachi")   # Karachi | Lahore Air Cargo
    clearance_date = Column(Date)
    warehouse_arrival_date = Column(Date)
    status = Column(String(20), default="in_transit")    # in_transit | cleared | warehoused | consumed
    notes = Column(Text)

    supplier = relationship("FabricSupplier")


class FabricIssuance(TenantBaseModel):
    """
    Records when a FabricRoll is issued to a department or CMT order.
    On creation, the roll status changes to 'issued' or 'consumed'.
    """
    __tablename__ = "fabric_issuances"
    __table_args__ = (
        Index("idx_issuance_tenant_roll", "tenant_id", "roll_id"),
    )

    roll_id = Column(UUID(as_uuid=True), ForeignKey("fabric_rolls.id"), nullable=False)
    cmt_order_reference = Column(String(50))             # CMT order number (cross-module reference)
    issued_to_department = Column(String(50), nullable=False)  # stitching | cutting | finishing | packing
    issued_qty_meters = Column(Numeric(10, 2))
    issued_qty_kg = Column(Numeric(10, 3), nullable=False)
    issued_date = Column(Date, nullable=False)
    issued_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    notes = Column(Text)

    roll = relationship("FabricRoll", back_populates="issuances")
```

### 6.3 API Endpoints

All Fabric Mill endpoints require auth. Write operations require `fabric_write` permission (owner, manager, operator). Accountants have read-only access.

```
# Suppliers
GET    /api/v1/fabric/suppliers                     List suppliers (paginated, ?search=)
POST   /api/v1/fabric/suppliers                     Create supplier
GET    /api/v1/fabric/suppliers/{id}                Get supplier + summary stats
PATCH  /api/v1/fabric/suppliers/{id}                Update supplier

# Lots
GET    /api/v1/fabric/lots                          List lots (?status=active&fabric_category=woven&page=1)
POST   /api/v1/fabric/lots                          Create lot
GET    /api/v1/fabric/lots/{id}                     Get lot detail + rolls list
PATCH  /api/v1/fabric/lots/{id}                     Update lot

# Rolls
GET    /api/v1/fabric/rolls                         List rolls (?lot_id=&status=available&page=1)
POST   /api/v1/fabric/rolls                         Create roll (or bulk: accepts array)
GET    /api/v1/fabric/rolls/{id}                    Get roll detail + issuances
PATCH  /api/v1/fabric/rolls/{id}                    Update roll (weight, location, status)
POST   /api/v1/fabric/rolls/{id}/issue              Issue roll to department/order → status = issued

# Yarn Types
GET    /api/v1/fabric/yarn-types                    List yarn types (?fiber_type=cotton&page=1)
POST   /api/v1/fabric/yarn-types                    Create yarn type
GET    /api/v1/fabric/yarn-types/{id}               Get yarn type + current stock
PATCH  /api/v1/fabric/yarn-types/{id}               Update yarn type
POST   /api/v1/fabric/yarn-types/{id}/transaction   Add stock transaction (receipt/issue/adjustment/wastage)
GET    /api/v1/fabric/yarn-types/{id}/transactions  List stock history (?from=&to=&page=1)

# Weaving Sessions
GET    /api/v1/fabric/weaving-sessions              List sessions (?lot_id=&date_from=&date_to=&page=1)
POST   /api/v1/fabric/weaving-sessions              Log weaving session
PATCH  /api/v1/fabric/weaving-sessions/{id}         Update session

# Knitting Sessions
GET    /api/v1/fabric/knitting-sessions             List sessions (?yarn_type_id=&date_from=&date_to=&page=1)
POST   /api/v1/fabric/knitting-sessions             Log knitting session
PATCH  /api/v1/fabric/knitting-sessions/{id}        Update session

# Imported Fabric (LC Tracking)
GET    /api/v1/fabric/imports                       List imports (?status=in_transit&page=1)
POST   /api/v1/fabric/imports                       Create import record (LC opened)
GET    /api/v1/fabric/imports/{id}                  Get import detail
PATCH  /api/v1/fabric/imports/{id}                  Update import (status progression, clearance date, costs)

# Reports
GET    /api/v1/fabric/reports/inventory-summary     Stock summary by fabric_category + total value
GET    /api/v1/fabric/reports/consumption           Issued vs received per period (?from=&to=)
GET    /api/v1/fabric/reports/low-stock             Yarn types below reorder_level
```

### 6.4 Frontend Pages

| Route | Description |
|-------|-------------|
| `/fabric-mill` | Overview: stock level cards (woven, knitted, imported, yarn), recent lot arrivals, low-stock alerts |
| `/fabric-mill/lots` | Lot list table with fabric_category filter tabs, status badges, total weight/rolls |
| `/fabric-mill/lots/[id]` | Lot detail: header info + rolls table with status badges + issue button per roll |
| `/fabric-mill/rolls` | All rolls across lots; filter by status, fabric_type; bulk issue action |
| `/fabric-mill/yarn` | Yarn stock cards per type; stock-in / stock-out slide-in sheet; transaction history table |
| `/fabric-mill/weaving` | Weaving session log; filter by loom / date; cumulative production summary |
| `/fabric-mill/knitting` | Knitting session log; filter by machine / yarn type / date |
| `/fabric-mill/imports` | LC tracking table: lc_number, supplier, status (badge), landed cost; status update action |
| `/fabric-mill/suppliers` | Supplier directory; balance column (outstanding payable) |
| `/fabric-mill/reports` | Inventory summary pie chart + consumption chart; download buttons |

---

## 7. Module 2 — CMT Order Lifecycle

### 7.1 Overview

The CMT module is transplanted from the PoC (`cmt-stitching-system/`) with `tenant_id` added to every table and RLS policies applied. The business logic (auto-billing, order status machine, lot tracking, sub-orders) is preserved exactly. One new field is added to `cmt_production_sessions`: `operator_id`.

### 7.2 Core Models (migrated from PoC)

All models in `backend/app/models/cmt/` inherit `TenantBaseModel`. Fields are identical to the PoC except for the addition of `tenant_id`. Full field lists are in `cmt-stitching-system/backend/app/models/`.

| Model | Table | Key Change vs PoC |
|-------|-------|------------------|
| CmtOrder | `cmt_orders` | + `tenant_id` |
| CmtOrderItem | `cmt_order_items` | + `tenant_id` |
| CmtParty | `cmt_parties` | + `tenant_id` |
| CmtBill | `cmt_bills` | + `tenant_id` |
| CmtBillRateTemplate | `cmt_bill_rate_templates` | + `tenant_id` (templates are per-tenant, not global) |
| CmtOrderAccessory | `cmt_order_accessories` | + `tenant_id` |
| CmtProductionSession | `cmt_production_sessions` | + `tenant_id` + **`operator_id UUID`** (new) |
| CmtFinancialTransaction | `cmt_financial_transactions` | + `tenant_id` |
| CmtProduct | `cmt_products` | + `tenant_id` |
| CmtProductBOMItem | `cmt_product_bom_items` | + `tenant_id` |
| CmtInventoryCategory | `cmt_inventory_categories` | + `tenant_id` |
| CmtInventoryItem | `cmt_inventory_items` | + `tenant_id` |
| CmtInventoryTransaction | `cmt_inventory_transactions` | + `tenant_id` |
| CmtQualityCheckpoint | `cmt_quality_checkpoints` | + `tenant_id` |
| CmtDefectLog | `cmt_defect_logs` | + `tenant_id` |
| CmtCashAccount | `cmt_cash_accounts` | + `tenant_id` |
| CmtCashEntry | `cmt_cash_entries` | + `tenant_id` |
| CmtOverheadExpense | `cmt_overhead_expenses` | + `tenant_id` |
| CmtExpense | `cmt_expenses` | + `tenant_id` |
| CmtTodo | `cmt_todos` | + `tenant_id` |
| CmtShareLink | `cmt_share_links` | + `tenant_id` |
| CmtAuditLog | `cmt_audit_logs` | + `tenant_id` |

### 7.3 Order Status Machine

```
pending
  ↓
stitching_in_progress   [BOM materials consumed for "stitching" department]
  ↓
stitching_complete
  ↓
packing_in_progress     [BOM materials consumed for "packing" department]
  ↓
packing_complete        [→ AUTO-TRIGGERS bill generation via auto_bill_service]
  ↓
dispatched              [Set automatically when first bill is created]
```

### 7.4 Bill Series (Settled Convention — Do Not Change)

| Series | Purpose | Auto-Generated | Trigger |
|--------|---------|----------------|---------|
| A | Stitching bill: `stitch_rate_party × total_qty` | Yes | On `packing_complete` |
| B | Accessories / materials bill | Conditional | Only if order has accessories |
| C | Packing bill: `pack_rate_party × total_qty` | Yes | On `packing_complete` |
| D | Miscellaneous / manual | No | Manual creation |

### 7.5 API Endpoints

All CMT endpoints migrated from PoC. Paths are unchanged. Full list in PoC's AGENTS.md.

Key API additions vs. PoC:

```
POST /api/v1/cmt/production
Body: { order_id, department, session_date, machines_used,
        operator_id,   ← NEW (separate from supervisor_id)
        supervisor_id, start_time, end_time, duration_hours, notes }

GET /api/v1/cmt/bills/{id}/pdf   ← NEW (reportlab PDF invoice download)
```

---

## 8. Module 3 — Inventory & BOM

### 8.1 Overview

The Inventory & BOM module is carried over from the PoC with tenant isolation added. No structural changes to the core models. The Fabric Mill introduces `FabricIssuance` as the cross-module link between rolls and CMT orders.

### 8.2 BOM Consumption Logic (unchanged from PoC)

```
For each BOMItem on a product:
  consumption_per_piece = material_quantity / covers_quantity
  # e.g. 1 roll covers 150 pieces → consumes 0.00667 rolls per piece

On order entering stitching_in_progress:
  deduct BOM items where department = "stitching"

On order entering packing_in_progress:
  deduct BOM items where department = "packing"
```

### 8.3 Cross-Module Fabric Link

When a fabric roll is issued to a CMT order (`POST /fabric/rolls/{id}/issue`):
1. `FabricIssuance` record is created with `cmt_order_reference`
2. `FabricRoll.status` → `issued`
3. When the order completes production, operator updates roll to `consumed`
4. `FabricRoll.status` → `consumed`

This gives a complete audit trail: LC → lot → roll → CMT order.

---

## 9. Module 4 — Party Ledgers

### 9.1 Overview

Two ledger types:
- **CMT customer ledger** — based on `CmtParty` + `CmtBill` + `CmtFinancialTransaction` (carried from PoC)
- **Fabric supplier ledger** — based on `FabricSupplier` + `FabricPurchaseLedger` (new)

### 9.2 New Model — FabricPurchaseLedger

```python
class FabricPurchaseLedger(TenantBaseModel):
    """
    Payable invoices from fabric suppliers.
    Separate from CMT financial transactions to keep supplier payables clean.
    """
    __tablename__ = "fabric_purchase_ledger"
    __table_args__ = (
        Index("idx_fabric_purchase_tenant_supplier", "tenant_id", "supplier_id"),
        Index("idx_fabric_purchase_due", "tenant_id", "due_date", "status"),
    )

    supplier_id = Column(UUID(as_uuid=True), ForeignKey("fabric_suppliers.id"), nullable=False)
    lot_id = Column(UUID(as_uuid=True), ForeignKey("fabric_lots.id"))   # optional link to lot
    invoice_number = Column(String(50), nullable=False)
    invoice_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    paid_amount = Column(Numeric(12, 2), default=0, nullable=False)
    status = Column(String(20), default="unpaid")       # unpaid | partial | paid
    payment_date = Column(Date)
    payment_reference = Column(String(100))             # bank transfer ref, JazzCash TxID
    notes = Column(Text)

    supplier = relationship("FabricSupplier")
    lot = relationship("FabricLot")
```

### 9.3 Aging Report Logic

Computed in `services/ledger_service.py`. No new database table.

```python
def get_aging_report(db: Session) -> AgingReport:
    """
    Retrieves outstanding CMT bills and fabric purchase invoices.
    Buckets receivables and payables into:
      - current:   0–30 days past due date
      - due:       31–60 days
      - overdue:   61–90 days
      - critical:  91+ days
    """
    today = date.today()
    # CMT receivables: cmt_bills where payment_status != "paid"
    # Fabric payables: fabric_purchase_ledger where status != "paid"
    # Returns: AgingReport { receivables: AgingBuckets, payables: AgingBuckets }
```

### 9.4 API Endpoints

```
GET  /api/v1/ledger/aging                         Aging report: 4 buckets for AR and AP
GET  /api/v1/ledger/outstanding                   Summary totals: total AR, total AP, net position
GET  /api/v1/ledger/customers/{party_id}          CMT party ledger (bills + payments + balance history)
GET  /api/v1/ledger/suppliers/{supplier_id}       Fabric supplier ledger (invoices + payments)
POST /api/v1/ledger/suppliers/{supplier_id}/payment  Record payment against supplier invoice
GET  /api/v1/ledger/export/aging                  Download aging report as Excel (openpyxl)
```

---

## 10. Module 5 — Financial Accounts

### 10.1 Overview

Financial Accounts are largely computed from existing CMT models (cash accounts, overhead expenses, financial transactions). Three new computed endpoints provide P&L, balance sheet, and cash flow — no new database tables.

### 10.2 P&L Per Order

```
Revenue  = sum of cmt_bills.amount_due where order_id = X (all series)
COGS     = sum of cmt_inventory_transactions.total_cost where reference_id = X (type = consumption)
           + cmt_order_accessories.purchase_cost
           + fabric_issuances.issued_qty_kg × fabric_rolls.cost_per_kg
Expenses = cmt_orders.transport_expense + loading_expense + misc_expense
Gross P&L = Revenue - COGS - Expenses
```

### 10.3 Monthly P&L

```
Revenue     = sum of cmt_bills.amount_due where bill_date in [month_start, month_end]
Payments In = sum of cmt_financial_transactions.amount where type = "payment" and date in range
COGS        = sum of cmt_inventory_transactions.total_cost in range (type = consumption)
Overhead    = sum of cmt_overhead_expenses.amount where paid_date in range
Net P&L     = Revenue - COGS - Overhead
```

### 10.4 Balance Sheet Snapshot

```
ASSETS
  Cash & Bank         = sum of cmt_cash_accounts opening_balance + net entries
  Accounts Receivable = sum of (cmt_bills.amount_due - amount_paid) where not paid
  Inventory           = sum of cmt_inventory_items.current_stock × cost_per_unit
                        + sum of fabric_rolls.total_cost where status = available
Total Assets

LIABILITIES
  Accounts Payable    = sum of fabric_purchase_ledger.amount - paid_amount where not paid
Total Liabilities

EQUITY = Total Assets - Total Liabilities
```

### 10.5 API Endpoints

```
GET  /api/v1/finance/pl/order/{order_id}     P&L for one CMT order
GET  /api/v1/finance/pl/monthly              Monthly P&L (?month=2026-04)
GET  /api/v1/finance/balance-sheet           Balance sheet snapshot (?as_of=2026-04-30)
GET  /api/v1/finance/cash-flow               Cash flow statement (?from=2026-04-01&to=2026-04-30)
GET  /api/v1/finance/export/pl               Download monthly P&L as Excel
GET  /api/v1/finance/export/balance-sheet    Download balance sheet as Excel
```

---

## 11. SaaS Billing & Subscriptions

### 11.1 Subscription Models

```python
# backend/app/models/subscription.py

class SubscriptionPlan(Base):
    """Global lookup — not tenant-scoped."""
    __tablename__ = "subscription_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(50), nullable=False, unique=True)  # free | pro | business | enterprise
    display_name = Column(String(100), nullable=False)
    price_pkr = Column(Numeric(10, 2), nullable=False, default=0)
    price_usd = Column(Numeric(10, 2), nullable=False, default=0)
    max_users = Column(Integer)                              # NULL = unlimited
    max_orders_per_month = Column(Integer)                   # NULL = unlimited
    features = Column(JSON, nullable=False)
    # features shape: {
    #   "fabric_mill": bool, "inventory": bool, "party_ledger_full": bool,
    #   "finance_basic": bool, "finance_full": bool, "pdf_export": bool,
    #   "excel_export": bool, "api_access": bool, "custom_branding": bool
    # }
    stripe_price_id_pkr = Column(String(100))
    stripe_price_id_usd = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TenantSubscription(Base):
    """Not RLS-scoped — admin can query across tenants."""
    __tablename__ = "tenant_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=False)
    status = Column(String(20), nullable=False, default="trialing")
    # trialing | active | past_due | canceled | unpaid
    trial_ends_at = Column(DateTime(timezone=True))
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    stripe_subscription_id = Column(String(100))
    provider_subscription_ref = Column(String(200))  # local gateway transaction ref
    payment_provider = Column(String(20))            # stripe | jazzcash | easypaysa | meezan
    canceled_at = Column(DateTime(timezone=True))
    cancel_reason = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UsageRecord(Base):
    """Monthly usage counters per tenant. Upserted on each relevant action."""
    __tablename__ = "usage_records"
    __table_args__ = (UniqueConstraint("tenant_id", "month"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    month = Column(String(7), nullable=False)   # "2026-04" (YYYY-MM)
    orders_created = Column(Integer, default=0, nullable=False)
    active_users = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PaymentRecord(Base):
    """Immutable record of every billing transaction."""
    __tablename__ = "payment_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("tenant_subscriptions.id"))
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False)         # PKR | USD
    payment_provider = Column(String(20), nullable=False)
    provider_reference_id = Column(String(200))          # Stripe PaymentIntent ID or local TxID
    status = Column(String(20), nullable=False, default="pending")
    # pending | succeeded | failed | refunded
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

### 11.2 PaymentProvider Protocol

```python
# backend/app/services/payment/provider.py
from typing import Protocol, Optional, TypedDict
from dataclasses import dataclass

class ProviderResponse(TypedDict):
    success: bool
    provider_ref: str
    redirect_url: Optional[str]    # For redirect-based flows (JazzCash, EasyPaisa, Meezan)
    client_secret: Optional[str]   # Stripe PaymentIntent client_secret for frontend
    error: Optional[str]

@dataclass
class WebhookEvent:
    event_type: str                # "payment.succeeded" | "payment.failed" | "subscription.canceled"
    provider: str
    tenant_id: Optional[str]
    subscription_ref: Optional[str]
    amount: Optional[float]
    currency: Optional[str]
    raw_payload: dict

class PaymentProvider(Protocol):
    async def create_customer(self, tenant_id: str, name: str, email: str) -> str:
        """Creates or retrieves a customer record at the provider. Returns provider customer ID."""
        ...

    async def create_subscription(
        self,
        customer_ref: str,
        plan: "SubscriptionPlan",
        currency: str,              # "PKR" | "USD"
        trial_days: int = 0,
    ) -> ProviderResponse:
        """Initiates a subscription. May return redirect_url or client_secret."""
        ...

    async def cancel_subscription(self, subscription_ref: str, at_period_end: bool = True) -> bool:
        """Cancels an active subscription. Returns True on success."""
        ...

    async def handle_webhook(self, payload: bytes, signature: str) -> WebhookEvent:
        """Validates and parses an incoming webhook/IPN. Raises ValueError on invalid signature."""
        ...


def get_payment_provider(provider: str) -> PaymentProvider:
    """Factory function. Returns the concrete provider implementation."""
    match provider:
        case "stripe":    return StripeProvider()
        case "jazzcash":  return JazzCashProvider()
        case "easypaysa": return EasyPaisaProvider()
        case "meezan":    return MeezanBankProvider()
        case _: raise ValueError(f"Unknown payment provider: {provider}")
```

### 11.3 Provider Details

| Provider | Target Users | Currency | Recurring | Auth Model |
|----------|-------------|---------|----------|-----------|
| **Stripe** | UAE buyers, exporters paying by card | USD / PKR | Native subscriptions | Stripe SDK, webhook signature |
| **JazzCash** | Pakistan mobile wallet users | PKR | Manual (send payment link monthly) | HMAC-SHA256 IPN signature |
| **EasyPaisa** | Pakistan mobile wallet, micro-businesses | PKR | Manual | SHA1-HMAC IPN |
| **Meezan Bank Ameen** | Conservative factory owners (no riba requirement), bank transfer | PKR | Manual / annual | Bank callback URL + token |

### 11.4 Feature Flag Enforcement

```python
# backend/app/core/dependencies.py
def require_feature(feature: str):
    """
    Checks the tenant's active subscription plan features JSON.
    Raises 403 if the feature is not included in their plan.
    """
    async def dependency(request: Request, db: AsyncSession = Depends(get_db)):
        tenant = await get_tenant(db, request.state.tenant_id)
        plan = await get_plan(db, tenant)
        if not plan.features.get(feature, False):
            raise HTTPException(
                403,
                detail={
                    "code": "FEATURE_NOT_AVAILABLE",
                    "message": f"Feature '{feature}' requires a higher plan tier.",
                    "upgrade_url": "/billing/plans"
                }
            )
    return Depends(dependency)

# Usage:
@router.get("/finance/pl/order/{order_id}")
async def get_order_pl(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: None = require_feature("finance_full"),
    _2: None = require_permission("finance_view"),
):
    ...
```

### 11.5 Free Tier Order Limit Enforcement

```python
# In order_service.create_order():
async def create_order(db, tenant_id, payload):
    plan = await get_tenant_plan(db, tenant_id)
    if plan.max_orders_per_month is not None:
        usage = await get_current_month_usage(db, tenant_id)
        if usage.orders_created >= plan.max_orders_per_month:
            raise HTTPException(
                429,
                detail={
                    "code": "ORDER_LIMIT_REACHED",
                    "message": f"Free plan limit of {plan.max_orders_per_month} orders/month reached.",
                    "upgrade_url": "/billing/plans"
                }
            )
    # ... proceed with creation
    await increment_usage(db, tenant_id, "orders_created")
```

### 11.6 API Endpoints

```
GET    /api/v1/subscriptions/plans              List all active plans with PKR + USD prices
GET    /api/v1/subscriptions/current            Current tenant subscription + usage stats
POST   /api/v1/subscriptions/checkout          Initiate payment
                                                Body: { plan_id, payment_provider, currency }
                                                Response: { redirect_url | client_secret }
POST   /api/v1/subscriptions/cancel            Cancel subscription (at period end)
GET    /api/v1/subscriptions/invoices          Billing history (PaymentRecord list)

POST   /api/v1/webhooks/stripe                 Stripe webhook (signature verified)
POST   /api/v1/webhooks/jazzcash               JazzCash IPN (HMAC verified)
POST   /api/v1/webhooks/easypaysa              EasyPaisa IPN (HMAC verified)
POST   /api/v1/webhooks/meezan                 Meezan Bank callback (token verified)
```

---

## 12. Non-Functional Requirements

### 12.1 Performance

| Requirement | Specification |
|-------------|--------------|
| API p95 latency | < 500ms (all endpoints, including DB queries) |
| API p99 latency | < 1,000ms |
| List endpoint default page size | 50 rows |
| List endpoint maximum page size | 200 rows |
| Query strategy | All queries must use composite index scans on `(tenant_id, id)`. No sequential scans on tenant tables. |
| N+1 prevention | Use SQLAlchemy `selectinload()` or `joinedload()` for all relationships |
| Pagination | Offset-based in v1. Cursor-based in v2 for large tenants. |

### 12.2 Security

| Requirement | Specification |
|-------------|--------------|
| DB-layer isolation | PostgreSQL RLS on all tenant-scoped tables. Enforced even if app code is wrong. |
| JWT algorithm | RS256 (asymmetric) in production. HS256 (symmetric) in development only. |
| Password hashing | bcrypt with cost factor 12. Direct `bcrypt` import — never `passlib`. |
| Rate limiting | Free: 100 req/min · Pro: 500 req/min · Business+: 2,000 req/min (per tenant, by JWT `tenant_id`) |
| Input validation | Pydantic v2 strict mode on all financial amount fields (`Decimal`, no float) |
| PII encryption at rest | Neon encryption-at-rest enabled (AES-256) |
| Audit logging | All write operations on financial data logged to `cmt_audit_logs` with `old_value / new_value` |
| Webhook signatures | All gateway webhooks verified before processing. Invalid signatures return 400. |
| Secrets management | All secrets in environment variables. Never committed to git. |

### 12.3 Availability & Recovery

| Requirement | Specification |
|-------------|--------------|
| Uptime (Business) | 99% monthly (≤ 7.3 hours downtime/month) |
| Uptime (Enterprise) | 99.9% monthly (≤ 43.8 minutes downtime/month) |
| Database failover | Neon automatic failover (< 30s RTO) |
| Backup retention | 7-day PITR on Neon for Pro+ tenants |
| Zero-downtime deploy | Vercel + Koyeb rolling deploy. Alembic migrations run before app starts. |

### 12.4 Progressive Web App (PWA)

The frontend is installable on Android (Chrome) and iOS (Safari Add to Home Screen). Floor supervisors use it on shared tablets in production areas.

```json
// frontend/public/manifest.json
{
  "name": "Textile ERP",
  "short_name": "TextileERP",
  "description": "Pakistan Textile Factory Management",
  "start_url": "/dashboard",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#1a2744",
  "theme_color": "#1a2744",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "categories": ["business", "productivity"]
}
```

Service worker behaviour (next-pwa / Workbox):
- Cache strategy: **NetworkFirst** for API calls, **CacheFirst** for static assets
- Offline: Show cached last-visited dashboard + orders list. Show "Offline — data may not be current" banner.
- Install prompt: Show "Add to Home Screen" banner after 3rd session

### 12.5 Urdu / RTL Support (Phase 2 — Feature-Flagged)

Phase 1 ships English-only. Urdu support is architected in but disabled via flag.

```bash
# .env
NEXT_PUBLIC_ENABLE_URDU=false   # Set to true in Phase 2
```

When enabled:
- Library: `next-intl` (server-side translations)
- Language switcher in user profile settings
- RTL layout: `<html lang="ur" dir="rtl">`
- Font: Noto Nastaliq Urdu (Google Fonts, variable font)
- Translation file: `frontend/messages/ur.json` (stub created in Phase 1, populated in Phase 2)
- All numeric formatting stays Latin (Urdu users in Pakistan use Latin numerals in business)

### 12.6 PDF Export — Bill Invoices

Generated server-side using `reportlab`. Streamed as `application/pdf`.

Invoice layout:
1. Header: Tenant logo (if uploaded), tenant name + city, "INVOICE" title
2. Bill metadata: bill_number, bill_date, CMT party name + contact
3. Order details: order_number, goods_description, total_quantity
4. Line items table: description | qty | rate | amount
5. Summary: subtotal, previous_balance, discount, total_due, amount_paid, balance_due
6. QR code: links to `/share/[token]` for party to view online
7. Footer: tenant address, phone, "Generated by Textile ERP"

Endpoint: `GET /api/v1/cmt/bills/{id}/pdf`

### 12.7 Excel Export — Reports

Generated server-side using `openpyxl`. Streamed as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

| Report | Endpoint | Columns |
|--------|---------|---------|
| Aging Report | `GET /api/v1/ledger/export/aging` | Party, Type, 0-30, 31-60, 61-90, 90+, Total |
| Monthly P&L | `GET /api/v1/finance/export/pl` | Category, Amount (PKR), % of Revenue |
| Balance Sheet | `GET /api/v1/finance/export/balance-sheet` | Account, Amount (PKR) |
| Inventory Summary | `GET /api/v1/fabric/reports/inventory-summary` | Type, Qty, Unit, Value |

All Excel files use:
- Row 1: Tenant name + report title + date
- Row 2: Column headers (bold, filled background `#1a2744`, white text)
- Rows 3+: Data rows (alternating row colours)
- Freeze panes on row 2
- Currency columns formatted as `PKR #,##0.00`
- Auto-fit column widths

---

## 13. Session Plan (4 × 3 hours)

### Session 1 — Foundation (3 hours): Tenancy + Fabric Mill Core

**Goal:** Working multi-tenant backend with Fabric Mill lot/roll/yarn CRUD. Frontend scaffold with auth.

**Deliverables:**
1. Repo `textile-erp-platform/` scaffolded (backend pyproject.toml, frontend package.json)
2. `TenantBaseModel` with `tenant_id`, `is_deleted`, timestamps
3. Core/Tenancy models: `Tenant`, `User`, `TenantUser`, `SubscriptionPlan`, `TenantSubscription`
4. Initial Alembic migration: tenancy tables + RLS policies + composite indexes
5. FastAPI app: `TenancyMiddleware`, `get_db()` dependency with `SET LOCAL app.tenant_id`
6. Auth endpoints: `POST /auth/register-tenant`, `POST /auth/login`, `GET /auth/me`
7. Fabric Mill models: `FabricSupplier`, `FabricLot`, `FabricRoll`, `YarnType`, `YarnTransaction`
8. Fabric Mill migration: tables + RLS policies + composite indexes
9. Fabric Mill API: `/fabric/suppliers`, `/fabric/lots`, `/fabric/rolls`, `/fabric/yarn-types`, `/fabric/yarn-types/{id}/transaction`
10. Frontend: Next.js 15 project setup, auth pages (login + register-tenant), Fabric Mill lot/roll list pages (basic tables)
11. **Test:** `test_tenancy_isolation.py` — create 2 tenants, verify Tenant A cannot see Tenant B's fabric lots even with a valid JWT

**Commit checkpoint:** `feat(session-1): tenant foundation + fabric mill core`

---

### Session 2 — CMT Integration (3 hours)

**Goal:** Full CMT order lifecycle working in multi-tenant context. Weaving/knitting/import tracking.

**Deliverables:**
1. All 21 CMT models transplanted to `models/cmt/` with `tenant_id` + RLS (one Alembic migration)
2. CMT services transplanted to `services/cmt/` — add tenant context parameter
3. All 40+ CMT API endpoints migrated under `/api/v1/cmt/` — transparent via tenancy middleware
4. `operator_id` field added to `CmtProductionSession`
5. CMT frontend pages migrated: orders, production, dispatch, bills, parties, quality, inventory, overhead, todos, settings
6. Weaving sessions + knitting sessions API + frontend pages
7. Imported fabric (LC tracking) API + frontend page
8. `FabricIssuance` model + migration + `POST /fabric/rolls/{id}/issue` endpoint
9. **Test:** `test_cmt_lifecycle.py` — full order flow (create → production → packing → dispatch → auto-bill) in tenant context; verify bills are tenant-scoped

**Commit checkpoint:** `feat(session-2): cmt module + fabric mill production + lc tracking`

---

### Session 3 — Advanced Modules (3 hours)

**Goal:** Party ledgers, financial reports, Excel exports.

**Deliverables:**
1. `FabricPurchaseLedger` model + migration + `POST /ledger/suppliers/{id}/payment`
2. Aging report service + endpoint (`GET /ledger/aging`) — 4 buckets for AR + AP
3. Party ledger pages: CMT customers + fabric suppliers
4. `GET /finance/pl/order/{id}` — P&L for a single CMT order
5. `GET /finance/pl/monthly` — aggregate monthly P&L
6. `GET /finance/balance-sheet` — assets/liabilities/equity snapshot
7. `GET /finance/cash-flow` — cash in/out per period
8. P&L frontend page + Balance Sheet frontend page
9. Excel export: aging report + monthly P&L (openpyxl)
10. Yarn transaction history page with running stock balance
11. **Test:** `test_ledger.py` — verify aging buckets correct for bills 15, 45, 75, 120 days overdue
12. **Test:** `test_finance.py` — verify P&L calculation correct against a known order fixture

**Commit checkpoint:** `feat(session-3): ledger, p&l, balance-sheet, excel-export`

---

### Session 4 — SaaS & Production (3 hours)

**Goal:** Subscription billing, PWA, PDF invoices, deploy to production.

**Deliverables:**
1. `PaymentProvider` Protocol + `StripeProvider` full implementation (create customer, create subscription, cancel, webhook handler)
2. `JazzCashProvider`, `EasyPaisaProvider`, `MeezanBankProvider` — stub implementation + IPN/webhook handler (signature verification only; actual payment processing configured in provider dashboard)
3. Subscription plans seeded in DB (free, pro, business)
4. Subscription checkout flow: `POST /subscriptions/checkout` → returns `{ client_secret }` (Stripe) or `{ redirect_url }` (local gateways)
5. Stripe webhook handler: `payment.succeeded` → activate subscription; `subscription.deleted` → downgrade to free
6. Feature-flag middleware: block free-tier users from Pro features with `{ upgrade_url }` in error
7. Free-tier order limit enforcement (50/month) with `{ upgrade_url }` in error
8. Onboarding wizard: 3-step (org details → invite team member → plan selection)
9. Billing management page: current plan, usage meter, invoices list, upgrade/cancel buttons
10. PDF invoice: `GET /cmt/bills/{id}/pdf` — reportlab PDF with QR code
11. PWA: `manifest.json`, `next-pwa` config, service worker, offline banner
12. Dashboard KPIs: active orders count, cash position (cash + bank accounts), overdue bills total, subscription usage %
13. **Test:** `test_subscription.py` — verify Stripe webhook activates subscription; verify feature flag blocks free user from `finance_full` endpoint
14. 100+ total tests passing across all modules
15. **Deploy:** `vercel --prod` (frontend) + Koyeb auto-deploy on `master` push (backend)

**Commit checkpoint:** `feat(session-4): saas-billing + pwa + pdf-export + production-deploy`

---

## 14. Migration Strategy from CMT PoC

### 14.1 PoC Status

The CMT PoC (`cmt-stitching-system/`) remains live and deployed at:
- Frontend: `https://cmt-stitching-asadullah-shafiques-projects.vercel.app`
- Backend: `https://level-hazel-agenticengineer-d513213b.koyeb.app`

It is NOT migrated. It stays live as a portfolio demo and sales proof-of-concept.

### 14.2 Code to Transplant

| PoC Source | ERP Destination | Transformation |
|-----------|----------------|---------------|
| `backend/app/services/auto_bill_service.py` | `services/cmt/auto_bill_service.py` | Add `tenant_id` to all queries; RLS handles filtering |
| `backend/app/services/bill_service.py` | `services/cmt/bill_service.py` | Same |
| `backend/app/services/financial_service.py` | `services/cmt/financial_service.py` | Same |
| `backend/app/services/order_service.py` | `services/cmt/order_service.py` | Add order limit check before creation |
| `backend/app/models/*.py` | `models/cmt/*.py` | Add `tenant_id` FK + RLS migration |
| `backend/app/api/v1/endpoints/*.py` | `api/v1/endpoints/cmt/*.py` | Add `require_permission()` deps |
| `frontend/src/components/orders.tsx` | `components/cmt/orders.tsx` | No change |
| `frontend/src/hooks/services.ts` | `hooks/services.ts` | Update base URL; JWT includes `tenant_id` |

### 14.3 Key Transformation Pattern

```python
# PoC pattern (no tenant isolation):
def get_orders(db: Session, current_user: User) -> list[Order]:
    return db.query(Order).filter(Order.is_deleted == False).all()

# ERP pattern (RLS handles tenant isolation transparently):
async def get_orders(db: AsyncSession, page: int = 1, page_size: int = 50) -> list[CmtOrder]:
    # app.tenant_id is already SET in this session by TenancyMiddleware
    # RLS policy automatically filters to current tenant — no explicit WHERE clause needed
    result = await db.execute(
        select(CmtOrder)
        .where(CmtOrder.is_deleted == False)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return result.scalars().all()
```

### 14.4 Bill Rate Templates

In the PoC, `BillRateTemplate` records are seeded globally in a migration. In the ERP, they are per-tenant. The initial migration seeds default templates for every new tenant on `register-tenant`:

```python
DEFAULT_TEMPLATES = [
    {"goods_type": "bedrail", "bill_series": "A", "customer_rate": 135, "labour_rate": 42},
    {"goods_type": "bedrail", "bill_series": "C", "customer_rate": 80, "labour_rate": 60},
    # ... full list from PoC migration 750a1916cced
]

async def seed_default_templates(db: AsyncSession, tenant_id: UUID):
    for t in DEFAULT_TEMPLATES:
        db.add(CmtBillRateTemplate(tenant_id=tenant_id, **t, is_active=True))
    await db.flush()
```

### 14.5 Internal Parties

The PoC seeds "CMT Labour" and "CMT Vendors" global parties. In the ERP, these are seeded per-tenant on `register-tenant`:

```python
async def seed_internal_parties(db: AsyncSession, tenant_id: UUID):
    for party in [
        {"name": "CMT Labour", "party_type": "labour"},
        {"name": "CMT Vendors", "party_type": "vendor"},
    ]:
        db.add(CmtParty(tenant_id=tenant_id, **party))
    await db.flush()
```

---

## Appendix A — Environment Variables

### Backend

```bash
# backend/.env
DATABASE_URL=postgresql+asyncpg://user:pass@host/dbname?sslmode=require
SECRET_KEY=<64-char random string for HS256 in dev>
# For RS256 in production:
JWT_PRIVATE_KEY=<PEM private key>
JWT_PUBLIC_KEY=<PEM public key>
ACCESS_TOKEN_EXPIRE_MINUTES=480
API_V1_STR=/api/v1
ALLOWED_ORIGINS=http://localhost:3000,https://textile-erp.vercel.app
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
JAZZCASH_MERCHANT_ID=...
JAZZCASH_PASSWORD=...
JAZZCASH_INTEGRITY_SALT=...
EASYPAYSA_ACCOUNT_NUMBER=...
EASYPAYSA_HASH_KEY=...
MEEZAN_MERCHANT_ID=...
MEEZAN_MERCHANT_KEY=...
```

### Frontend

```bash
# frontend/.env.local  (dev)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# frontend/.env.production
NEXT_PUBLIC_API_URL=https://<koyeb-backend-url>/api/v1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_ENABLE_URDU=false
```

---

## Appendix B — Locked Conventions (CLAUDE.md summary)

The following conventions are locked and must not be changed without explicit written approval:

- **Backend package manager:** `uv`. Never `pip install`.
- **Frontend package manager:** `npm`.
- **bcrypt:** Direct import. Never `passlib`.
- **DATABASE_URL:** Stored as `asyncpg://` in `.env`. Code normalises to `psycopg2://` for Alembic, stays `asyncpg://` for SQLAlchemy async engine.
- **Table prefix:** `cmt_` for all CMT models. `fabric_` for Fabric Mill models. No prefix for global tables.
- **Migrations:** Append-only. Never edit existing migration files. Use absolute paths in `alembic.ini`.
- **Soft deletes:** `is_deleted + deleted_at` on every tenant model. Always filter `is_deleted == False`.
- **Bill series:** A = stitching, B = accessories, C = packing, D = misc. Immutable.
- **Frontend routing:** Dashboard home is `/dashboard`, not `/`. Protected routes require JWT in `localStorage.erp_token`.
- **Forms:** Slide-in Sheet pattern for create/edit (not modal dialog).
- **Sidebar colour:** Navy `#1a2744`.
- **Financial amounts:** `Decimal` (Python) and `Numeric` (SQL). Never `float`.
- **Phase gates:** Stop after each session. Wait for written approval before starting the next.
