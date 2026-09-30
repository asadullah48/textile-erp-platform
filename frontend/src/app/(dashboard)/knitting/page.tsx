"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, ErrorNote, FilterSelect, FormDialog, PageHeader, SelectInput, Skeleton, StatCard, StatusBadge, TextInput } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { daysAgoIso, formatDate, formatKg, humanize, isoDate, num } from "@/lib/utils";
import { lotApi, productionApi, yarnApi } from "@/services/erp";
import type { KnittingSession } from "@/types";

export default function KnittingPage() {
  const { can } = useAuth();
  const [days, setDays] = useState("30");
  const from = daysAgoIso(Number(days) - 1);
  const sessions = useLoad(() => productionApi.knitting({ from, limit: 500 }), [from]);
  const yarn = useLoad(() => yarnApi.list());
  const lots = useLoad(() => lotApi.list({ fabric_category: "knitted", limit: 500 }));
  const yarnById = useMemo(() => new Map((yarn.data ?? []).map((y) => [y.id, y])), [yarn.data]);
  const rows = sessions.data ?? [];
  const produced = rows.reduce((a, k) => a + num(k.produced_kg), 0);
  const consumed = rows.reduce((a, k) => a + num(k.yarn_consumed_kg), 0);
  const reload = () => Promise.all([sessions.reload(), yarn.reload()]);

  return (
    <>
      <PageHeader eyebrow="Production" title="Knitting"
        subtitle="Machine sessions draw yarn straight from the ledger — a session that would take stock negative is rejected whole."
        actions={
          <FormDialog disabled={!can("fabric_write")} trigger={<Button><Plus /> Log session</Button>}
            title="Log a knitting session" submitLabel="Log session" wide
            onSubmit={async (b) => { await productionApi.logKnitting(b); await reload(); }}>
            <SelectInput label="Yarn" name="yarn_type_id" required className="sm:col-span-2"
              options={(yarn.data ?? []).map((y) => ({ value: y.id, label: `${y.yarn_count} ${y.fiber_type}${y.color_name ? ` · ${y.color_name}` : ""} (${formatKg(y.current_stock_kg)})` }))} />
            <TextInput label="Machine" name="machine_number" required placeholder="KM-2" />
            <SelectInput label="Into lot (optional)" name="lot_id" defaultValue=""
              options={[{ value: "", label: "—" }, ...(lots.data ?? []).map((l) => ({ value: l.id, label: l.lot_number }))]} />
            <TextInput label="Date" name="session_date" type="date" defaultValue={isoDate()} required />
            <SelectInput label="Shift" name="shift" defaultValue="day" options={["day", "night", "A", "B", "C"].map((s) => ({ value: s, label: humanize(s) }))} />
            <TextInput label="Fabric produced (kg)" name="produced_kg" type="number" step="0.001" min="0.001" required />
            <TextInput label="Yarn consumed (kg)" name="yarn_consumed_kg" type="number" step="0.001" min="0.001" required />
            <TextInput label="Gauge" name="gauge" type="number" min="1" />
            <SelectInput label="Grade" name="quality_grade" defaultValue="A" options={["A", "B", "C"].map((g) => ({ value: g, label: g }))} />
            <TextInput label="Operator" name="operator_name" />
          </FormDialog>
        }
      />
      <FilterSelect label="Period" value={days} onChange={setDays}
        options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Fabric knitted" value={formatKg(produced)} />
        <StatCard label="Yarn consumed" value={formatKg(consumed)} />
        <StatCard label="Process loss" value={consumed ? `${(((consumed - produced) / consumed) * 100).toFixed(1)}%` : "—"}
          hint="(yarn in − fabric out) ÷ yarn in" tone={consumed && (consumed - produced) / consumed > 0.06 ? "warn" : undefined} />
      </div>
      {sessions.error ? <ErrorNote message={sessions.error} onRetry={sessions.reload} /> : sessions.loading && !sessions.data ? <Skeleton /> : (
        <DataTable<KnittingSession>
          rows={rows}
          columns={[
            { header: "Date", cell: (k) => formatDate(k.session_date) },
            { header: "Machine", cell: (k) => <span className="font-mono text-xs">{k.machine_number}</span> },
            { header: "Yarn", cell: (k) => { const y = yarnById.get(k.yarn_type_id); return y ? `${y.yarn_count} ${y.fiber_type}` : "—"; } },
            { header: "Gauge", cell: (k) => k.gauge ?? "—" },
            { header: "Produced", align: "right", cell: (k) => formatKg(k.produced_kg) },
            { header: "Yarn used", align: "right", cell: (k) => formatKg(k.yarn_consumed_kg) },
            { header: "Grade", cell: (k) => <StatusBadge status={k.quality_grade} label={k.quality_grade} /> },
          ]}
        />
      )}
    </>
  );
}
