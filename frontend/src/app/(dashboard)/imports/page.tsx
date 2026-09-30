"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, ErrorNote, FilterSelect, FormDialog, PageHeader, SelectInput, Skeleton, StatCard, StatusBadge, TextInput } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { daysSince, formatDate, formatMeters, formatPKR, humanize, isoDate, num } from "@/lib/utils";
import { apiError, importApi, lotApi, supplierApi } from "@/services/erp";
import type { FabricImport } from "@/types";

const STEPS = ["in_transit", "cleared", "warehoused", "consumed"] as const;

function Steps({ status }: { status: FabricImport["status"] }) {
  const at = STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-1" aria-label={`Status: ${humanize(status)}`}>
      {STEPS.map((s, i) => (
        <span key={s} title={humanize(s)} className="h-1.5 w-6 rounded-full"
          style={{ background: i <= at ? (i === at ? "var(--primary)" : "color-mix(in oklch, var(--primary) 45%, white)") : "var(--muted)" }} />
      ))}
    </div>
  );
}

export default function ImportsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const imports = useLoad(() => importApi.list({ status }), [status]);
  const suppliers = useLoad(() => supplierApi.list());
  const lots = useLoad(() => lotApi.list({ fabric_category: "imported", limit: 500 }));
  const supplierName = useMemo(() => new Map((suppliers.data ?? []).map((s) => [s.id, s.name])), [suppliers.data]);
  const lotByImport = useMemo(() => new Map((lots.data ?? []).filter((l) => l.import_id).map((l) => [l.import_id!, l])), [lots.data]);
  const rows = imports.data ?? [];
  const reload = () => Promise.all([imports.reload(), lots.reload()]);
  const open = rows.filter((i) => i.status === "in_transit" || i.status === "cleared");

  const clear = async (i: FabricImport) => {
    try { await importApi.update(i.id, { status: "cleared", clearance_date: isoDate() }); await reload(); }
    catch (e) { alert(apiError(e)); }
  };

  return (
    <>
      <PageHeader eyebrow="Fabric" title="LC imports"
        subtitle="From LC opening to warehouse. Landed cost is computed server-side from FOB × rate + freight + insurance + duties — and locks once the lot is valued."
        actions={
          <FormDialog disabled={!can("fabric_import_write")} trigger={<Button><Plus /> Open LC</Button>}
            title="Record a new LC / shipment" submitLabel="Save LC" wide
            onSubmit={async (b) => { await importApi.create(b); await reload(); }}>
            <TextInput label="LC number" name="lc_number" required placeholder="MCB-LC-26-1001" />
            <SelectInput label="Supplier" name="supplier_id" required
              options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            <TextInput label="Fabric" name="fabric_type" required className="sm:col-span-2" placeholder="Polyester Peach Skin 75D" />
            <TextInput label="Quantity (m)" name="quantity_meters" type="number" step="0.01" min="0.01" required />
            <TextInput label="B/L or AWB" name="shipment_reference" />
            <SelectInput label="Currency" name="currency" defaultValue="USD" options={["USD", "EUR", "CNY", "GBP", "AED", "TRY"].map((c) => ({ value: c, label: c }))} />
            <TextInput label="FOB value (in currency)" name="fob_cost" type="number" step="0.01" min="0.01" required />
            <TextInput label="Exchange rate → PKR" name="exchange_rate" type="number" step="0.0001" min="0.0001" required placeholder="280.40" />
            <TextInput label="Freight (PKR)" name="freight_cost_pkr" type="number" step="0.01" min="0" />
            <TextInput label="Insurance (PKR)" name="insurance_cost_pkr" type="number" step="0.01" min="0" />
            <TextInput label="Duties & taxes (PKR)" name="duties_paid_pkr" type="number" step="0.01" min="0" />
            <SelectInput label="Port of entry" name="port_of_entry" defaultValue="Karachi"
              options={["Karachi", "Port Qasim", "Lahore Air Cargo", "Sialkot Dry Port", "Faisalabad Dry Port"].map((p) => ({ value: p, label: p }))} />
            <TextInput label="LC opened" name="lc_opened_date" type="date" defaultValue={isoDate()} required />
          </FormDialog>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Open LCs" value={open.length} />
        <StatCard label="Landed value in pipeline" value={formatPKR(open.reduce((a, i) => a + num(i.total_landed_cost_pkr), 0), true)} />
        <StatCard label="Meters inbound" value={formatMeters(open.reduce((a, i) => a + num(i.quantity_meters), 0))} />
      </div>
      <FilterSelect label="Status" value={status} onChange={setStatus}
        options={[{ value: "", label: "All statuses" }, ...STEPS.map((s) => ({ value: s, label: humanize(s) }))]} />

      {imports.error ? <ErrorNote message={imports.error} onRetry={imports.reload} /> : imports.loading && !imports.data ? <Skeleton /> : (
        <DataTable<FabricImport>
          rows={rows}
          columns={[
            { header: "LC", cell: (i) => <><span className="font-mono text-xs font-medium">{i.lc_number}</span>
              <span className="block text-xs text-muted-foreground">{supplierName.get(i.supplier_id) ?? "—"}</span></> },
            { header: "Fabric", cell: (i) => <span className="block max-w-[14rem] truncate">{i.fabric_type}</span> },
            { header: "Qty", align: "right", cell: (i) => formatMeters(i.quantity_meters) },
            { header: "FOB", align: "right", cell: (i) => `${i.currency} ${num(i.fob_cost).toLocaleString()}` },
            { header: "Landed / m", align: "right", cell: (i) => formatPKR(i.landed_cost_per_meter_pkr) },
            { header: "Progress", cell: (i) => (
              <div className="space-y-1">
                <Steps status={i.status} />
                <p className="text-[11px] text-muted-foreground">
                  {humanize(i.status)} · {i.status === "in_transit" ? `${daysSince(i.lc_opened_date)}d since LC`
                    : i.status === "cleared" && i.clearance_date ? `${daysSince(i.clearance_date)}d at port` : formatDate(i.warehouse_arrival_date)}
                </p>
              </div>
            ) },
            { header: "", cell: (i) => {
              const lot = lotByImport.get(i.id);
              if (lot) return <Link href={`/fabric-lots/${lot.id}`} className="text-xs text-primary hover:underline">Lot {lot.lot_number}</Link>;
              if (!can("fabric_import_write")) return null;
              return (
                <div className="flex justify-end gap-1.5">
                  {i.status === "in_transit" && <Button size="xs" variant="outline" onClick={() => clear(i)}>Mark cleared</Button>}
                  <FormDialog disabled={!can("fabric_write")} trigger={<Button size="xs">Receive</Button>}
                    title={`Receive ${i.lc_number} into the warehouse`}
                    description={`Opens an imported lot valued at ${formatPKR(i.landed_cost_per_meter_pkr)}/m landed. Optionally split into rolls.`}
                    submitLabel="Receive & open lot"
                    onSubmit={async (b) => { await importApi.receive(i.id, b); await reload(); }}>
                    <TextInput label="Lot number" name="lot_number" required defaultValue={`IMP-${i.lc_number.split("-").slice(-1)[0]}`} />
                    <TextInput label="Colour" name="color" defaultValue="As per LC" />
                    <TextInput label="Split into rolls" name="roll_count" type="number" min="0" max="500" defaultValue="10"
                      hint={`${formatMeters(i.quantity_meters)} ÷ rolls; last roll absorbs rounding.`} />
                    <TextInput label="Location" name="location" defaultValue="Import Bay 1" />
                    <TextInput label="Arrived on" name="warehouse_arrival_date" type="date" defaultValue={isoDate()} />
                  </FormDialog>
                </div>
              );
            } },
          ]}
        />
      )}
    </>
  );
}
