"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { BarList, DataTable, ErrorNote, FilterSelect, FormDialog, PageHeader, SelectInput, Skeleton, StatCard, StatusBadge, TextInput } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { daysAgoIso, formatDate, formatKg, formatMeters, humanize, isoDate, num } from "@/lib/utils";
import { lotApi, productionApi, reportApi, yarnApi } from "@/services/erp";
import type { WeavingSession } from "@/types";

export default function WeavingPage() {
  const { can } = useAuth();
  const [loom, setLoom] = useState("");
  const [days, setDays] = useState("30");
  const from = daysAgoIso(Number(days) - 1);
  const sessions = useLoad(() => productionApi.weaving({ loom, from, limit: 500 }), [loom, from]);
  const report = useLoad(() => reportApi.production({ from }), [from]);
  const lots = useLoad(() => lotApi.list({ limit: 500 }));
  const yarn = useLoad(() => yarnApi.list());
  const lotById = useMemo(() => new Map((lots.data ?? []).map((l) => [l.id, l])), [lots.data]);
  const looms = report.data?.looms ?? [];
  const reload = () => Promise.all([sessions.reload(), report.reload(), yarn.reload()]);

  return (
    <>
      <PageHeader eyebrow="Production" title="Weaving"
        subtitle="Shift-by-shift loom log. Logging yarn consumption posts it to the yarn ledger in the same transaction — or not at all."
        actions={
          <FormDialog disabled={!can("fabric_write")} trigger={<Button><Plus /> Log shift</Button>}
            title="Log a weaving shift" submitLabel="Log shift" wide
            onSubmit={async (b) => { await productionApi.logWeaving(b); await reload(); }}>
            <SelectInput label="Lot being woven" name="lot_id" required className="sm:col-span-2"
              options={(lots.data ?? []).filter((l) => l.fabric_category !== "imported").map((l) => ({ value: l.id, label: `${l.lot_number} · ${l.fabric_type}` }))} />
            <TextInput label="Loom" name="loom_number" required placeholder="L-07" />
            <TextInput label="Operator" name="operator_name" />
            <TextInput label="Date" name="session_date" type="date" defaultValue={isoDate()} required />
            <SelectInput label="Shift" name="shift" defaultValue="day" options={["day", "night", "A", "B", "C"].map((s) => ({ value: s, label: humanize(s) }))} />
            <TextInput label="Meters produced" name="produced_meters" type="number" step="0.01" min="0.01" required />
            <SelectInput label="Quality grade" name="quality_grade" defaultValue="A" options={["A", "B", "C"].map((g) => ({ value: g, label: g }))} />
            <TextInput label="Picks / inch" name="picks_per_inch" type="number" min="1" />
            <TextInput label="Ends / inch" name="ends_per_inch" type="number" min="1" />
            <SelectInput label="Weft yarn used" name="yarn_type_id" defaultValue=""
              options={[{ value: "", label: "— not tracked —" }, ...(yarn.data ?? []).map((y) => ({ value: y.id, label: `${y.yarn_count} ${y.fiber_type} (${formatKg(y.current_stock_kg)})` }))]} />
            <TextInput label="Yarn consumed (kg)" name="yarn_consumed_kg" type="number" step="0.001" min="0.001" hint="Required if a yarn is selected." />
          </FormDialog>
        }
      />

      <div className="flex flex-wrap gap-2">
        <FilterSelect label="Period" value={days} onChange={setDays}
          options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
        <FilterSelect label="Loom" value={loom} onChange={setLoom}
          options={[{ value: "", label: "All looms" }, ...looms.map((l) => ({ value: l.machine, label: l.machine }))]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Woven" value={formatMeters(report.data?.weaving_meters)} />
            <StatCard label="Shifts logged" value={looms.reduce((a, l) => a + l.sessions, 0)} />
          </div>
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Output by loom</h2>
            <BarList items={looms.map((l) => ({ label: l.machine, value: num(l.output), sub: `${l.grade_a_pct}% A · ${l.sessions} shifts` }))} format={(v) => formatMeters(v)} />
          </div>
        </div>
        <div className="lg:col-span-2">
          {sessions.error ? <ErrorNote message={sessions.error} onRetry={sessions.reload} /> : sessions.loading && !sessions.data ? <Skeleton /> : (
            <DataTable<WeavingSession>
              rows={sessions.data ?? []}
              columns={[
                { header: "Date", cell: (w) => formatDate(w.session_date) },
                { header: "Loom", cell: (w) => <span className="font-mono text-xs">{w.loom_number}</span> },
                { header: "Shift", cell: (w) => humanize(w.shift) },
                { header: "Lot", cell: (w) => { const l = lotById.get(w.lot_id); return l ? <Link className="hover:underline" href={`/fabric-lots/${l.id}`}>{l.lot_number}</Link> : "—"; } },
                { header: "Operator", cell: (w) => w.operator_name ?? "—" },
                { header: "Meters", align: "right", cell: (w) => formatMeters(w.produced_meters) },
                { header: "Yarn", align: "right", cell: (w) => w.yarn_consumed_kg ? formatKg(w.yarn_consumed_kg) : "—" },
                { header: "Grade", cell: (w) => <StatusBadge status={w.quality_grade} label={w.quality_grade} /> },
              ]}
            />
          )}
        </div>
      </div>
    </>
  );
}
