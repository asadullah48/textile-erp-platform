"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { DataTable, ErrorNote, FormDialog, PageHeader, SelectInput, Skeleton, StatusBadge, TextInput } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { cn, formatDate, formatKg, formatPKR, humanize, isoDate, num } from "@/lib/utils";
import { supplierApi, yarnApi } from "@/services/erp";
import type { YarnTransaction, YarnType } from "@/types";

const label = (y: YarnType) => `${y.yarn_count} ${humanize(y.fiber_type)}${y.color_name ? ` · ${y.color_name}` : ""}`;

export default function YarnPage() {
  const { can } = useAuth();
  const yarn = useLoad(() => yarnApi.list());
  const suppliers = useLoad(() => supplierApi.list());
  const [selected, setSelected] = useState<string | null>(null);
  const current = useMemo(() => yarn.data?.find((y) => y.id === selected) ?? yarn.data?.[0] ?? null, [yarn.data, selected]);
  const ledger = useLoad(() => (current ? yarnApi.transactions(current.id) : Promise.resolve([])), [current?.id, current?.current_stock_kg]);

  return (
    <>
      <PageHeader eyebrow="Production" title="Yarn stock"
        subtitle="The stock book, digitised: every kilo in or out is a ledger entry with a running balance. Stock can't be edited — only posted."
        actions={
          <FormDialog disabled={!can("fabric_write")} trigger={<Button><Plus /> New yarn count</Button>}
            title="Add a yarn count" submitLabel="Add yarn" wide
            onSubmit={async (b) => { await yarnApi.create(b); await yarn.reload(); }}>
            <TextInput label="Count" name="yarn_count" required placeholder="20/1, 30/2, 150D" />
            <SelectInput label="Fibre" name="fiber_type" defaultValue="cotton"
              options={["cotton", "polyester", "blended", "viscose", "acrylic", "nylon", "other"].map((v) => ({ value: v, label: humanize(v) }))} />
            <TextInput label="Colour / quality" name="color_name" placeholder="Raw White" />
            <SelectInput label="Supplier" name="supplier_id" defaultValue=""
              options={[{ value: "", label: "—" }, ...(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
            <TextInput label="Cost per kg (PKR)" name="unit_cost_per_kg" type="number" step="0.01" min="0" required />
            <TextInput label="Reorder level (kg)" name="reorder_level_kg" type="number" step="0.001" min="0" />
            <TextInput label="Opening stock (kg)" name="opening_stock_kg" type="number" step="0.001" min="0"
              hint="Posted as a receipt so the ledger starts balanced." />
          </FormDialog>
        }
      />

      {yarn.error ? <ErrorNote message={yarn.error} onRetry={yarn.reload} /> : yarn.loading && !yarn.data ? <Skeleton /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(yarn.data ?? []).map((y) => {
              const stock = num(y.current_stock_kg), reorder = num(y.reorder_level_kg);
              const low = reorder > 0 && stock < reorder;
              const pct = Math.min(100, reorder > 0 ? (stock / (reorder * 3)) * 100 : 100);
              return (
                <button key={y.id} onClick={() => setSelected(y.id)}
                  className={cn("rounded-lg border bg-card p-4 text-left transition-shadow hover:shadow-sm",
                    current?.id === y.id && "ring-2 ring-primary/40", low && "border-l-4 border-l-[var(--warn)]")}>
                  <p className="text-sm font-semibold">{label(y)}</p>
                  <p className="num mt-2 text-2xl font-semibold">{formatKg(stock)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: low ? "var(--warn)" : "var(--ok)" }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Reorder at {formatKg(reorder)} · {formatPKR(num(y.unit_cost_per_kg))}/kg
                  </p>
                </button>
              );
            })}
          </div>

          {current && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Ledger · {label(current)}</h2>
                <div className="flex gap-2">
                  {(["receipt", "issue", "wastage", "adjustment"] as const).map((t) => (
                    <FormDialog key={t} disabled={!can("fabric_write")}
                      trigger={<Button size="sm" variant={t === "receipt" ? "default" : "outline"}>{humanize(t)}</Button>}
                      title={`${humanize(t)} · ${label(current)}`}
                      description={`On hand: ${formatKg(current.current_stock_kg, 3)}`}
                      submitLabel={`Post ${t}`}
                      onSubmit={async (b) => { await yarnApi.post(current.id, { ...b, transaction_type: t }); await yarn.reload(); }}>
                      {t === "adjustment" && (
                        <SelectInput label="Direction" name="direction" defaultValue="in"
                          options={[{ value: "in", label: "In (found stock)" }, { value: "out", label: "Out (shortage)" }]} />
                      )}
                      <TextInput label="Quantity (kg)" name="quantity_kg" type="number" step="0.001" min="0.001" required />
                      {t === "receipt" && <TextInput label="Cost per kg (PKR)" name="unit_cost" type="number" step="0.01" min="0"
                        hint="Updates the standard cost used for valuation." />}
                      {t === "issue" && <TextInput label="Lot / order reference" name="lot_reference" />}
                      <TextInput label="Date" name="transaction_date" type="date" defaultValue={isoDate()} />
                      <TextInput label="Notes" name="notes" placeholder={t === "receipt" ? "GRN / truck no." : ""} />
                    </FormDialog>
                  ))}
                </div>
              </div>
              {ledger.loading && !ledger.data ? <Skeleton rows={4} /> : (
                <DataTable<YarnTransaction>
                  rows={ledger.data ?? []}
                  columns={[
                    { header: "Date", cell: (t) => formatDate(t.transaction_date) },
                    { header: "Type", cell: (t) => (
                      <span className="inline-flex items-center gap-1.5">
                        {t.direction === "in" ? <ArrowDownLeft className="size-3.5 text-[var(--ok)]" /> : <ArrowUpRight className="size-3.5 text-destructive" />}
                        {humanize(t.transaction_type)}
                        {t.source !== "manual" && <StatusBadge status="reserved" label={t.source} />}
                      </span>
                    ) },
                    { header: "Qty", align: "right", cell: (t) => `${t.direction === "in" ? "+" : "−"}${formatKg(t.quantity_kg, 1)}` },
                    { header: "Balance", align: "right", cell: (t) => <span className="font-medium">{formatKg(t.balance_after_kg, 1)}</span> },
                    { header: "Value", align: "right", cell: (t) => t.total_cost ? formatPKR(t.total_cost) : "—" },
                    { header: "Reference", cell: (t) => <span className="block max-w-[18rem] truncate text-xs text-muted-foreground">
                      {[t.lot_reference, t.order_reference, t.notes].filter(Boolean).join(" · ") || "—"}</span> },
                  ]}
                />
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
