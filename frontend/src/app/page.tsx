"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight, Boxes, Database, Factory, GitBranch, Lock, QrCode, Route, ShieldCheck, Ship, Sparkles, Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { BROWSER_DEMO } from "@/lib/api";
import { apiError } from "@/services/erp";

const REPO = "https://github.com/asadullah48/textile-erp-platform";

const MODULES = [
  { icon: Boxes, title: "Lots & rolls", body: "Digital roll register. Bulk-register a truck of 24 rolls in one step, issue partial rolls to cutting or dyeing — over-issue is impossible, even with two supervisors clicking at once." },
  { icon: Waves, title: "Yarn stock ledger", body: "Every kilo in or out is an append-only entry with a running balance. Stock can't be typed over — only posted. Negative stock is rejected by the database itself." },
  { icon: Factory, title: "Weaving & knitting", body: "Shift-by-shift loom and machine logs with picks, ends, gauge and grade. Logging a shift draws its yarn from the ledger atomically — all or nothing." },
  { icon: Ship, title: "LC imports", body: "Track an LC from opening to port clearance to warehouse. Landed cost per meter is computed server-side and locked once the imported lot is valued." },
  { icon: Route, title: "Roll traceability", body: "Scan a roll's QR label to see its chain of custody: supplier or LC, the looms and operators that wove it, and every issue to the floor." },
  { icon: Sparkles, title: "Mill Pulse", body: "Seven deterministic rules — dead stock, yarn runway, port demurrage risk, loom quality drift — each alert showing the exact numbers that fired it. No AI guesswork." },
];

const ENGINEERING = [
  { icon: Lock, title: "Tenant isolation in PostgreSQL", body: "Row-Level Security with FORCE on every table. A query with no WHERE clause still can't see another mill's rows — proven by a test that runs raw SQL." },
  { icon: ShieldCheck, title: "RBAC on every endpoint", body: "Owner, manager, operator, accountant. The API enforces it; the UI only mirrors it. Switch roles in the demo and watch buttons — and permissions — change." },
  { icon: Database, title: "Invariants, not conventions", body: "Row locks on stock movements, a strict ledger sequence, CHECK constraints, forward-only LC status. 42 backend tests, including a mutation-checked concurrency race." },
  { icon: GitBranch, title: "Spec-first, open source", body: "Built against a written spec (SPEC-ERP.md) with CI on every push. FastAPI · SQLAlchemy 2 async · Next.js 15 · TypeScript strict." },
];

export default function LandingPage() {
  const { enterDemo, user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async () => {
    if (user) return router.push("/dashboard");
    setBusy(true);
    setError(null);
    try {
      await enterDemo();
      router.push("/dashboard");
    } catch (e) {
      setError(apiError(e, "The demo could not start — please try again."));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">TE</span>
            <span className="text-sm font-semibold">Textile ERP</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" render={<a href={REPO} target="_blank" rel="noreferrer" />} nativeButton={false}>GitHub</Button>
            {!BROWSER_DEMO && <Button variant="ghost" size="sm" render={<Link href="/login" />} nativeButton={false}>Sign in</Button>}
            <Button size="sm" onClick={launch} disabled={busy}>{user ? "Open app" : "Live demo"}</Button>
          </nav>
        </div>
      </header>

      <section className="weave relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-5 lg:py-24">
          <div className="lg:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-primary">Module 1 · Fabric Mill · complete</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              The roll register, yarn book and LC file — <span className="text-sidebar-primary">in one system a mill can trust.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-sidebar-foreground/80">
              Pakistan&apos;s fabric mills in Faisalabad, Gujranwala and Karachi still run on Excel registers, paper stock books and WhatsApp.
              Textile ERP replaces them with a multi-tenant system where the numbers can&apos;t drift.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={launch} disabled={busy}
                className="h-11 bg-sidebar-primary px-5 text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
                {busy ? "Setting up your mill…" : "Explore the live demo"} <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" render={<a href={REPO} target="_blank" rel="noreferrer" />} nativeButton={false}
                className="h-11 border-sidebar-border bg-transparent px-5 text-sidebar-foreground hover:bg-sidebar-accent">
                Read the code
              </Button>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
            <p className="mt-4 text-xs text-sidebar-foreground/60">
              {BROWSER_DEMO
                ? "No sign-up. The demo runs a seeded Faisalabad mill entirely in your browser."
                : "No sign-up. You get a private, pre-seeded mill that deletes itself after 24 hours."}
            </p>
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-4 shadow-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">Mill Pulse · this morning</p>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  ["critical", "LC MCB-LC-26-0829 cleared 10 days ago but not warehoused", "demurrage risk"],
                  ["warning", "Lot FSD-W-2305 untouched for 120 days", "PKR 4.9 Lac on the rack"],
                  ["warning", "Loom L-12: only 20% A-grade", "5 shifts, 30 days"],
                  ["warning", "30/1 Cotton: about 5 days of cover left", "148 kg/day burn"],
                ].map(([sev, title, ev]) => (
                  <li key={title} className="rounded-md bg-sidebar/70 p-2.5">
                    <p className="flex items-start gap-2">
                      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${sev === "critical" ? "bg-red-400" : "bg-sidebar-primary"}`} />
                      <span>{title}</span>
                    </p>
                    <p className="ml-3.5 mt-0.5 font-mono text-[10px] text-sidebar-foreground/55">{ev}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">What Module 1 covers</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The first of seven planned modules — from raw yarn to finished export. Each capability below is live in the demo.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-5">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex items-center gap-2"><QrCode className="size-5 text-accent-foreground" />
            <h2 className="text-2xl font-semibold tracking-tight">Built like it will hold real money</h2></div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {ENGINEERING.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><Icon className="size-4" /></span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Roadmap</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            ["Module 1", "Fabric Mill", "Complete"],
            ["Module 2", "CMT order lifecycle & auto-billing", "Specced"],
            ["Modules 3–5", "BOM inventory, party ledgers, financials", "Specced"],
            ["SaaS", "Billing: Stripe, JazzCash, EasyPaisa, Meezan", "Specced"],
          ].map(([k, v, s]) => (
            <li key={k} className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</p>
              <p className="mt-1 text-sm font-medium">{v}</p>
              <p className={`mt-2 text-xs font-medium ${s === "Complete" ? "text-[var(--ok)]" : "text-muted-foreground"}`}>{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>Built by <a className="underline" href="https://asadullahshafique-devunity.vercel.app" target="_blank" rel="noreferrer">Asadullah Shafique</a> · MIT licensed</p>
          <p>Demo data is fictional. Business names are invented.</p>
        </div>
      </footer>
    </div>
  );
}
