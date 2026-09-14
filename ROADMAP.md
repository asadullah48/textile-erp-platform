# Roadmap

This is the condensed, visitor-facing version of the four-session build plan documented in
full in [`SPEC-ERP.md`](./SPEC-ERP.md) §13 (session deliverables) and §14 (migration strategy
from the CMT proof-of-concept). If the two ever disagree, `SPEC-ERP.md` is authoritative.

## Status today

**Session 1 — Foundation: done.** Multi-tenant backend (FastAPI + async SQLAlchemy 2 +
PostgreSQL RLS), JWT auth, role-based permissions, and the Fabric Mill module (lot/roll CRUD,
summary). Next.js 15 frontend with auth pages and basic Fabric Mill list views.

**Sessions 2–4: specced, not built.** Everything below is real design work already written
down — not aspirational language invented for this document.

## Stage 1 — Harden this repo (near-term)

- CI running the 5 existing tenancy-isolation tests plus new coverage for fabric-lot/roll CRUD
  and auth endpoints (`backend/app/tests/test_fabric_lots.py`, `test_auth.py`)
- `LICENSE` (MIT), `CONTRIBUTING.md` — both added alongside this roadmap
- A typed frontend API client generated against the backend's Pydantic schemas, replacing
  hand-written fetch calls

## Stage 2 — CMT Integration (`SPEC-ERP.md` Session 2)

Transplant the CMT order lifecycle from the author's live proof-of-concept,
[`cmt-stitching-system`](https://github.com/asadullah48/cmt-stitching-system):

- 21 CMT models moved to `models/cmt/`, each gaining a `tenant_id` FK and an RLS policy
- 40+ CMT API endpoints migrated under `/api/v1/cmt/`
- Weaving/knitting session tracking, imported-fabric (LC) tracking
- `FabricIssuance` model + `POST /fabric/rolls/{id}/issue` — the join point between the Fabric
  Mill module that exists today and the CMT module landing in this stage

The transformation pattern is already specified: PoC code filters in the service layer
(`db.query(Order).filter(Order.is_deleted == False)`); the ERP pattern relies on RLS to scope
the same query automatically once `TenancyMiddleware` has set `app.tenant_id` — no explicit
`WHERE tenant_id` needed in application code.

## Stage 3 — Advanced Modules (`SPEC-ERP.md` Session 3)

- Party ledgers (CMT customers + fabric suppliers) with an aging report (`GET /ledger/aging`,
  4 buckets: 15/45/75/120 days overdue)
- Financial reports: per-order P&L, monthly P&L, balance sheet, cash flow
- Excel export for the aging report and monthly P&L

This is the stage where a read-only endpoint like the aging report becomes a realistic target
for a small autonomous loop — an agent that watches the buckets and drafts reminders instead of
a human running the report on a schedule.

## Stage 4 — SaaS & Production (`SPEC-ERP.md` Session 4)

- `PaymentProvider` protocol: full Stripe implementation, plus stub JazzCash / EasyPaisa /
  MeezanBank providers (signature-verified webhooks; actual processing stays in each provider's
  own dashboard)
- Subscription checkout, feature-flag middleware gating Pro features by plan, free-tier order
  limits
- PDF invoicing, PWA (manifest, service worker, offline banner)
- Deploy: Vercel (frontend) + Koyeb, auto-deploy on push to `master` — the same targets the
  live `cmt-stitching-system` PoC already uses. Not Kubernetes/Dapr — that stack isn't part of
  this repo's actual production plan, so it isn't listed here as one.

## Contributing to a specific stage

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Work on a Stage 2+ item generally depends on
earlier stages landing first — open an issue before starting on anything past Stage 1.
