"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Boxes, ChevronLeft, Factory, PackageCheck, Scissors, Ship, Waves, type LucideIcon } from "lucide-react";
import { IssueRollDialog } from "@/components/erp/IssueRollDialog";
import { ErrorNote, PageHeader, Skeleton, StatCard, StatusBadge } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { cn, formatDate, formatMeters, formatPKR, num } from "@/lib/utils";
import { rollApi } from "@/services/erp";
import type { TraceEvent } from "@/types";

const KIND: Record<TraceEvent["kind"], { icon: LucideIcon; cls: string }> = {
  import: { icon: Ship, cls: "bg-primary/10 text-primary" },
  lot: { icon: Boxes, cls: "bg-accent text-accent-foreground" },
  weaving: { icon: Factory, cls: "bg-secondary text-secondary-foreground" },
  knitting: { icon: Waves, cls: "bg-secondary text-secondary-foreground" },
  roll: { icon: PackageCheck, cls: "bg-[color-mix(in_oklch,var(--ok)_15%,white)] text-[color-mix(in_oklch,var(--ok)_80%,black)]" },
  issue: { icon: Scissors, cls: "bg-[color-mix(in_oklch,var(--warn)_18%,white)] text-[color-mix(in_oklch,var(--warn)_60%,black)]" },
};

/** Roll genealogy — the record an export buyer's compliance auditor asks for. */
export default function RollTracePage() {
  const { rollId } = useParams<{ rollId: string }>();
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => rollApi.trace(rollId), [rollId]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton rows={8} />;
  if (!data) return null;
  const { roll, lot, supplier, fabric_import: imp, timeline, weaving_sessions } = data;
  const looms = [...new Set(weaving_sessions.map((w) => w.loom_number))];

  return (
    <>
      <Link href={`/fabric-lots/${lot.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> Lot {lot.lot_number}
      </Link>
      <PageHeader
        eyebrow="Roll traceability"
        title={roll.roll_number}
        subtitle={`${lot.fabric_type} · ${lot.color} · ${formatMeters(roll.length_meters, 1)}${roll.location ? ` · ${roll.location}` : ""}`}
        actions={<>
          <StatusBadge status={roll.status} />
          <IssueRollDialog roll={roll} onDone={reload} disabled={!can("fabric_write")} />
          <Button size="sm" variant="outline" onClick={() => window.print()} className="no-print">Print record</Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Source" value={<span className="text-base">{supplier?.name ?? lot.supplier ?? "In-house"}</span>}
          hint={supplier ? [supplier.city, supplier.country].filter(Boolean).join(", ") : undefined} />
        <StatCard label={imp ? `Landed cost · LC ${imp.lc_number}` : "Cost basis"}
          value={lot.cost_per_meter ? `${formatPKR(lot.cost_per_meter)}/m` : "—"}
          hint={imp ? `${imp.currency} ${num(imp.fob_cost).toLocaleString()} FOB × ${num(imp.exchange_rate)} + duties & freight` : undefined} />
        <StatCard label="Looms" value={looms.length ? looms.join(", ") : "—"} hint={`${weaving_sessions.length} weaving session(s) on this lot`} />
        <StatCard label="Remaining" value={formatMeters(roll.remaining_meters, 1)} hint={`${formatMeters(roll.issued_meters, 1)} issued`} />
      </div>

      <section aria-labelledby="tl" className="rounded-lg border bg-card p-5">
        <h2 id="tl" className="mb-4 text-base font-semibold">Chain of custody</h2>
        <ol className="relative space-y-5 border-l border-border pl-6">
          {timeline.map((e, i) => {
            const k = KIND[e.kind];
            const Icon = k.icon;
            return (
              <li key={i} className="relative">
                <span className={cn("absolute -left-[34px] grid size-6 place-items-center rounded-full ring-4 ring-card", k.cls)}>
                  <Icon className="size-3.5" />
                </span>
                <p className="num text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{formatDate(e.at)}</p>
                <p className="text-sm font-medium">{e.title}</p>
                {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
