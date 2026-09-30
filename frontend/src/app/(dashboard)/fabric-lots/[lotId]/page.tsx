"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Layers, Plus, Printer, Route } from "lucide-react";
import { IssueRollDialog } from "@/components/erp/IssueRollDialog";
import {
  DataTable, EmptyState, ErrorNote, FormDialog, PageHeader, SelectInput, Skeleton, StatCard, StatusBadge, TextInput,
} from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { formatDate, formatMeters, formatPKR, humanize, num } from "@/lib/utils";
import { apiError, lotApi, productionApi } from "@/services/erp";
import type { FabricRoll } from "@/types";

export default function LotDetailPage() {
  const { lotId } = useParams<{ lotId: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [lot, rolls, summary, weaving] = await Promise.all([
      lotApi.get(lotId), lotApi.rolls(lotId), lotApi.summary(lotId), productionApi.weaving({ lot_id: lotId }),
    ]);
    return { lot, rolls, summary, weaving };
  }, [lotId]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton rows={8} />;
  if (!data) return null;
  const { lot, rolls, summary, weaving } = data;
  const nextNo = `${lot.lot_number.replace(/[^A-Za-z0-9]+/g, "").slice(-6)}-`;

  const remove = async () => {
    if (!confirm(`Delete lot ${lot.lot_number}? This cannot be undone from the app.`)) return;
    try {
      await lotApi.remove(lot.id);
      router.push("/fabric-lots");
    } catch (e) {
      alert(apiError(e));
    }
  };

  return (
    <>
      <Link href="/fabric-lots" className="no-print inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> All lots
      </Link>
      <PageHeader
        eyebrow={`${humanize(lot.fabric_category)} lot`}
        title={lot.lot_number}
        subtitle={<>
          {lot.fabric_type} · {lot.color}{lot.gsm ? ` · ${num(lot.gsm)} GSM` : ""}{lot.width_cm ? ` · ${num(lot.width_cm)} cm` : ""}
          <br />
          Received {formatDate(lot.received_date)}{lot.supplier ? ` from ${lot.supplier}` : ""}{lot.notes ? ` · ${lot.notes}` : ""}
        </>}
        actions={<>
          <StatusBadge status={lot.status} />
          {rolls.length > 0 && (
            <Button variant="outline" size="sm" render={<Link href={`/fabric-lots/${lot.id}/labels`} />} nativeButton={false}>
              <Printer /> Roll labels
            </Button>
          )}
          {can("fabric_delete") && <Button variant="destructive" size="sm" onClick={remove}>Delete</Button>}
        </>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Rolls" value={summary.roll_count} hint={`${formatMeters(summary.total_meters)} registered of ${formatMeters(lot.total_meters)}`}
          tone={num(summary.total_meters) > 0 && num(summary.total_meters) !== num(lot.total_meters) ? "warn" : undefined} />
        <StatCard label="Available" value={formatMeters(summary.meters_available)} />
        <StatCard label="Reserved" value={formatMeters(summary.meters_reserved)} />
        <StatCard label="Issued to floor" value={formatMeters(summary.meters_issued)} />
        <StatCard label="On-hand value" value={summary.stock_value_pkr ? formatPKR(summary.stock_value_pkr, true) : "—"}
          hint={lot.cost_per_meter ? `@ PKR ${num(lot.cost_per_meter).toLocaleString()}/m` : "No cost per meter set"}
          tone={lot.cost_per_meter ? undefined : "warn"} />
      </div>

      <section className="space-y-3" aria-labelledby="rolls-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="rolls-h" className="text-base font-semibold">Rolls</h2>
          <div className="flex gap-2">
            <FormDialog disabled={!can("fabric_write")} trigger={<Button size="sm" variant="outline"><Plus /> One roll</Button>}
              title="Add a roll" submitLabel="Add roll" onSubmit={async (b) => { await lotApi.addRoll(lot.id, b); await reload(); }}>
              <TextInput label="Roll number" name="roll_number" required placeholder={`${nextNo}025`} />
              <TextInput label="Length (m)" name="length_meters" type="number" step="0.01" min="0.01" required />
              <TextInput label="Weight (kg)" name="weight_kg" type="number" step="0.001" min="0" />
              <SelectInput label="Grade" name="grade" defaultValue="" options={[{ value: "", label: "—" }, { value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }]} />
              <TextInput label="Rack / location" name="location" placeholder="Rack A-3" />
            </FormDialog>
            <FormDialog disabled={!can("fabric_write")} trigger={<Button size="sm"><Layers /> Bulk register</Button>}
              title="Register a delivery of rolls" description="How trucks actually arrive: 24 rolls of 100 m in one step."
              submitLabel="Register rolls" wide onSubmit={async (b) => { await lotApi.addRollsBulk(lot.id, b); await reload(); }}>
              <TextInput label="Roll number prefix" name="prefix" required defaultValue={nextNo} />
              <TextInput label="Start at" name="start" type="number" min="0" defaultValue={String(rolls.length + 1)} />
              <TextInput label="How many rolls" name="count" type="number" min="1" max="500" required defaultValue="10" />
              <TextInput label="Length each (m)" name="length_meters" type="number" step="0.01" min="0.01" required defaultValue="100" />
              <TextInput label="Weight each (kg)" name="weight_kg" type="number" step="0.001" min="0" />
              <TextInput label="Rack / location" name="location" />
            </FormDialog>
          </div>
        </div>
        <DataTable<FabricRoll>
          rows={rolls}
          empty={<EmptyState title="No rolls registered" hint="Bulk-register the delivery to start issuing fabric." />}
          columns={[
            { header: "Roll", cell: (r) => <span className="font-mono text-xs font-medium">{r.roll_number}</span> },
            { header: "Length", align: "right", cell: (r) => formatMeters(r.length_meters, 1) },
            { header: "Remaining", align: "right", cell: (r) => formatMeters(r.remaining_meters, 1) },
            { header: "Grade", cell: (r) => r.grade ? <StatusBadge status={r.grade} label={r.grade} /> : "—" },
            { header: "Location", cell: (r) => r.location ?? "—" },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "", cell: (r) => (
              <div className="flex justify-end gap-1.5">
                <Button size="xs" variant="ghost" render={<Link href={`/fabric-rolls/${r.id}`} />} nativeButton={false} title="Trace">
                  <Route />
                </Button>
                <IssueRollDialog roll={r} onDone={reload} disabled={!can("fabric_write")} />
              </div>
            ) },
          ]}
        />
      </section>

      {weaving.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Woven into this lot</h2>
          <DataTable
            rows={weaving}
            columns={[
              { header: "Date", cell: (w) => formatDate(w.session_date) },
              { header: "Loom", cell: (w) => <span className="font-mono text-xs">{w.loom_number}</span> },
              { header: "Shift", cell: (w) => humanize(w.shift) },
              { header: "Operator", cell: (w) => w.operator_name ?? "—" },
              { header: "Output", align: "right", cell: (w) => formatMeters(w.produced_meters) },
              { header: "Grade", cell: (w) => <StatusBadge status={w.quality_grade} label={w.quality_grade} /> },
            ]}
          />
        </section>
      )}
    </>
  );
}
