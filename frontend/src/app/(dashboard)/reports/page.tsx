"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { BarList, DataTable, ErrorNote, FilterSelect, PageHeader, Skeleton, StatCard } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useLoad } from "@/hooks/useLoad";
import { daysAgoIso, formatDate, formatKg, formatMeters, formatPKR, humanize, isoDate, num } from "@/lib/utils";
import { apiError, reportApi } from "@/services/erp";

export default function ReportsPage() {
  const [days, setDays] = useState("30");
  const from = daysAgoIso(Number(days) - 1);
  const { data, error, loading, reload } = useLoad(async () => {
    const [inv, cons, prod, low] = await Promise.all([
      reportApi.inventory(), reportApi.consumption({ from }), reportApi.production({ from }), reportApi.lowStock(),
    ]);
    return { inv, cons, prod, low };
  }, [from]);
  const [downloading, setDownloading] = useState(false);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const csv = await reportApi.stockCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `roll-stock-${isoDate()}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(apiError(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Business" title="Reports"
        subtitle="Stock valuation, fabric flow and production quality — computed from the ledger, not typed in."
        actions={<>
          <FilterSelect label="Period" value={days} onChange={setDays}
            options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last 12 months" }]} />
          <Button variant="outline" onClick={downloadCsv} disabled={downloading}><Download /> Roll stock CSV</Button>
        </>}
      />
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={8} /> : data && (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Stock valuation</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total at cost" value={formatPKR(data.inv.total_value_pkr, true)} hint={formatPKR(data.inv.total_value_pkr)} />
              <StatCard label="Yarn" value={formatPKR(data.inv.yarn.stock_value_pkr, true)} hint={formatKg(data.inv.yarn.stock_kg)} />
              <StatCard label="Fabric" value={formatPKR(data.inv.fabric.reduce((a, c) => a + num(c.stock_value_pkr), 0), true)}
                hint={formatMeters(data.inv.fabric.reduce((a, c) => a + num(c.meters_available), 0))} />
              <StatCard label="Not costed" value={formatMeters(data.inv.unvalued_meters)} hint="Excluded from totals until priced"
                tone={num(data.inv.unvalued_meters) > 0 ? "warn" : undefined} />
            </div>
            <DataTable
              rows={data.inv.fabric.map((c) => ({ ...c, id: c.fabric_category }))}
              columns={[
                { header: "Category", cell: (c) => humanize(c.fabric_category) },
                { header: "Lots", align: "right", cell: (c) => c.lots },
                { header: "Rolls available", align: "right", cell: (c) => c.rolls_available },
                { header: "Meters on hand", align: "right", cell: (c) => formatMeters(c.meters_available) },
                { header: "Value", align: "right", cell: (c) => formatPKR(c.stock_value_pkr) },
              ]}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold">Fabric flow</h2>
              <p className="mb-3 text-xs text-muted-foreground">{formatDate(data.cons.date_from)} – {formatDate(data.cons.date_to)}</p>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <StatCard label="Received" value={formatMeters(data.cons.meters_received)} />
                <StatCard label="Issued to floor" value={formatMeters(data.cons.meters_issued)} />
                <StatCard label="Yarn in" value={formatKg(data.cons.yarn_in_kg)} />
                <StatCard label="Yarn out" value={formatKg(data.cons.yarn_out_kg)} />
              </div>
              {data.cons.issued_by_department.length ? (
                <BarList items={data.cons.issued_by_department.map((d) => ({ label: humanize(d.department), value: num(d.meters) }))} format={(v) => formatMeters(v)} />
              ) : <p className="text-sm text-muted-foreground">No fabric issued in this period.</p>}
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold">Production quality</h2>
              <p className="mb-3 text-xs text-muted-foreground">{formatMeters(data.prod.weaving_meters)} woven · {formatKg(data.prod.knitting_kg)} knitted</p>
              <DataTable
                rows={[...data.prod.looms.map((l) => ({ ...l, kind: "Loom", id: `l-${l.machine}` })), ...data.prod.knitting_machines.map((m) => ({ ...m, kind: "Knitting", id: `k-${m.machine}` }))]}
                columns={[
                  { header: "Machine", cell: (m) => <span className="font-mono text-xs">{m.machine}</span> },
                  { header: "Type", cell: (m) => m.kind },
                  { header: "Shifts", align: "right", cell: (m) => m.sessions },
                  { header: "Output", align: "right", cell: (m) => m.kind === "Loom" ? formatMeters(m.output) : formatKg(m.output) },
                  { header: "A-grade", align: "right", cell: (m) => (
                    <span className={num(m.grade_a_pct) < 80 ? "font-semibold text-destructive" : undefined}>{m.grade_a_pct}%</span>
                  ) },
                ]}
              />
            </section>
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Yarn to reorder</h2>
            <DataTable
              rows={data.low.map((l) => ({ ...l, id: l.yarn_type_id }))}
              empty={<p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Every yarn count is above its reorder level.</p>}
              columns={[
                { header: "Yarn", cell: (l) => l.label },
                { header: "On hand", align: "right", cell: (l) => formatKg(l.current_stock_kg) },
                { header: "Reorder level", align: "right", cell: (l) => formatKg(l.reorder_level_kg) },
                { header: "Shortfall", align: "right", cell: (l) => <span className="font-semibold">{formatKg(l.shortfall_kg)}</span> },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}
