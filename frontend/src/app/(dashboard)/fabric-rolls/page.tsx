"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Route, Search } from "lucide-react";
import { IssueRollDialog } from "@/components/erp/IssueRollDialog";
import { DataTable, EmptyState, ErrorNote, FilterSelect, PageHeader, Skeleton, StatCard, StatusBadge } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounced } from "@/hooks/useDebounced";
import { useLoad } from "@/hooks/useLoad";
import { formatDate, formatMeters, humanize, num } from "@/lib/utils";
import { lotApi, rollApi } from "@/services/erp";
import type { FabricRoll } from "@/types";

const STATUSES = ["available", "reserved", "issued", "consumed"];

export default function FabricRollsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("available");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const rolls = useLoad(() => rollApi.list({ status, search: q, limit: 500 }), [status, q]);
  const lots = useLoad(() => lotApi.list({ limit: 500 }));
  const issuances = useLoad(() => rollApi.allIssuances({ limit: 12 }));
  const lotById = useMemo(() => new Map((lots.data ?? []).map((l) => [l.id, l])), [lots.data]);
  const rollById = useMemo(() => new Map((rolls.data ?? []).map((r) => [r.id, r])), [rolls.data]);
  const reload = async () => { await Promise.all([rolls.reload(), issuances.reload()]); };

  const onHand = (rolls.data ?? []).reduce((a, r) => a + num(r.remaining_meters), 0);

  return (
    <>
      <PageHeader eyebrow="Fabric" title="Rolls & issuing"
        subtitle="Find any roll across every lot and issue it to the floor — partial issues supported, over-issue impossible." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={`${humanize(status || "all")} rolls`} value={rolls.data?.length ?? "—"} />
        <StatCard label="Meters remaining (this view)" value={formatMeters(onHand)} />
        <StatCard label="Issued in the last 12 issues" value={formatMeters((issuances.data ?? []).reduce((a, i) => a + num(i.issued_meters), 0))} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Status" value={status} onChange={setStatus}
          options={[{ value: "", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: humanize(s) }))]} />
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input aria-label="Search rolls" placeholder="Roll number…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {rolls.error ? <ErrorNote message={rolls.error} onRetry={rolls.reload} /> : rolls.loading && !rolls.data ? <Skeleton /> : (
            <DataTable<FabricRoll>
              rows={rolls.data ?? []}
              empty={<EmptyState title="No rolls in this view" />}
              columns={[
                { header: "Roll", cell: (r) => <Link href={`/fabric-rolls/${r.id}`} className="font-mono text-xs font-medium text-primary hover:underline">{r.roll_number}</Link> },
                { header: "Lot", cell: (r) => {
                  const lot = lotById.get(r.lot_id);
                  return lot ? <Link href={`/fabric-lots/${lot.id}`} className="hover:underline">{lot.lot_number}<span className="block max-w-[12rem] truncate text-xs text-muted-foreground">{lot.fabric_type}</span></Link> : "—";
                } },
                { header: "Remaining", align: "right", cell: (r) => formatMeters(r.remaining_meters, 1) },
                { header: "Location", cell: (r) => r.location ?? "—" },
                { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
                { header: "", cell: (r) => (
                  <div className="flex justify-end gap-1.5">
                    <Button size="xs" variant="ghost" render={<Link href={`/fabric-rolls/${r.id}`} />} nativeButton={false} title="Trace"><Route /></Button>
                    <IssueRollDialog roll={r} onDone={reload} disabled={!can("fabric_write")} />
                  </div>
                ) },
              ]}
            />
          )}
        </div>
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold">Recent issues to the floor</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {(issuances.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium capitalize">{i.issued_to_department}
                    {i.cmt_order_reference && <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{i.cmt_order_reference}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {rollById.get(i.roll_id)?.roll_number ?? "roll"} · {formatDate(i.issued_date)}
                  </span>
                </span>
                <span className="num text-sm">{formatMeters(i.issued_meters)}</span>
              </li>
            ))}
            {issuances.data?.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nothing issued yet.</li>}
          </ul>
        </aside>
      </div>
    </>
  );
}
