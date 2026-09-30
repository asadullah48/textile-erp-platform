"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { BarList, ErrorNote, InsightCard, PageHeader, Skeleton, StatCard, StatusBadge } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { daysAgoIso, formatDate, formatKg, formatMeters, formatPKR, humanize, num } from "@/lib/utils";
import { importApi, lotApi, reportApi } from "@/services/erp";

export default function DashboardPage() {
  const { user, tenant } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [inv, pulse, prod, lots, imports] = await Promise.all([
      reportApi.inventory(),
      reportApi.insights(),
      reportApi.production({ from: daysAgoIso(13) }),
      lotApi.list({ limit: 6 }),
      importApi.list(),
    ]);
    return { inv, pulse, prod, lots, imports };
  });

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton rows={8} />;

  const { inv, pulse, prod, lots, imports } = data;
  const fabricMeters = inv.fabric.reduce((a, c) => a + num(c.meters_available), 0);
  const openLCs = imports.filter((i) => i.status === "in_transit" || i.status === "cleared");
  const critical = pulse.insights.filter((i) => i.severity === "critical").length;
  const gradeTotal = Object.values(prod.grade_mix).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow={humanize(tenant?.industry ?? "fabric_mill")}
        title={`Assalam-o-Alaikum, ${user?.full_name.split(" ")[0]}`}
        subtitle="Today's position across fabric, yarn, looms and LCs — and what needs attention first."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stock value" value={formatPKR(inv.total_value_pkr, true)}
          hint={num(inv.unvalued_meters) > 0 ? `${formatMeters(inv.unvalued_meters)} not yet costed` : "Fabric + yarn at cost"} />
        <StatCard label="Fabric on hand" value={formatMeters(fabricMeters)}
          hint={`${inv.fabric.reduce((a, c) => a + c.rolls_available, 0)} rolls available`} />
        <StatCard label="Yarn on hand" value={formatKg(inv.yarn.stock_kg)}
          hint={`${inv.yarn.below_reorder} of ${inv.yarn.yarn_types} counts below reorder`}
          tone={inv.yarn.below_reorder ? "warn" : undefined} />
        <StatCard label="Open LCs" value={openLCs.length}
          hint={formatPKR(openLCs.reduce((a, i) => a + num(i.total_landed_cost_pkr), 0), true) + " landed"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-3 lg:col-span-3" aria-labelledby="pulse">
          <div className="flex items-baseline justify-between">
            <h2 id="pulse" className="text-base font-semibold">
              Mill Pulse {critical > 0 && <span className="ml-1 text-sm font-normal text-destructive">· {critical} critical</span>}
            </h2>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5" /> {pulse.rules_evaluated} deterministic rules · no AI guesswork
            </span>
          </div>
          {pulse.insights.length === 0 ? (
            <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">All clear — no rule fired on today&apos;s data.</p>
          ) : (
            <div className="space-y-2">{pulse.insights.map((i) => <InsightCard key={i.rule + i.title} insight={i} />)}</div>
          )}
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Loom output · last 14 days</h2>
              <span className="num text-xs text-muted-foreground">{formatMeters(prod.weaving_meters)}</span>
            </div>
            {prod.looms.length ? (
              <BarList items={prod.looms.map((l) => ({ label: l.machine, value: num(l.output), sub: `${l.grade_a_pct}% A` }))}
                format={(v) => formatMeters(v)} />
            ) : <p className="text-sm text-muted-foreground">No weaving logged in this period.</p>}
            {gradeTotal > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs text-muted-foreground">Grade mix (weaving + knitting)</p>
                <div className="flex h-2.5 overflow-hidden rounded-full">
                  {(["A", "B", "C"] as const).map((g, i) => (
                    <div key={g} title={`${g}: ${prod.grade_mix[g] ?? 0}`}
                      style={{ width: `${((prod.grade_mix[g] ?? 0) / gradeTotal) * 100}%`, background: ["var(--ok)", "var(--warn)", "var(--destructive)"][i] }} />
                  ))}
                </div>
                <p className="num mt-1 text-[11px] text-muted-foreground">
                  A {prod.grade_mix.A ?? 0} · B {prod.grade_mix.B ?? 0} · C {prod.grade_mix.C ?? 0}
                </p>
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Latest lots</h2>
              <Button size="xs" variant="ghost" render={<Link href="/fabric-lots" />} nativeButton={false}>All lots <ArrowRight /></Button>
            </div>
            <ul className="divide-y">
              {lots.map((l) => (
                <li key={l.id}>
                  <Link href={`/fabric-lots/${l.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.lot_number}</span>
                      <span className="block truncate text-xs text-muted-foreground">{l.fabric_type} · {formatDate(l.received_date)}</span>
                    </span>
                    <StatusBadge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
