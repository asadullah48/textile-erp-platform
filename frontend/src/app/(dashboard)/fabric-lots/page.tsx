"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  DataTable, EmptyState, ErrorNote, FilterSelect, FormDialog, PageHeader, SelectInput, Skeleton, StatusBadge, TextInput,
} from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounced } from "@/hooks/useDebounced";
import { useLoad } from "@/hooks/useLoad";
import { cn, formatDate, formatMeters, formatPKR, humanize, isoDate, num } from "@/lib/utils";
import { lotApi, supplierApi } from "@/services/erp";
import type { FabricLot } from "@/types";

const CATEGORIES = ["", "woven", "knitted", "imported", "yarn_fabric"] as const;
const STATUSES = ["", "pending", "in_stock", "partially_consumed", "fully_consumed"];

export default function FabricLotsPage() {
  const { can } = useAuth();
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const lots = useLoad(() => lotApi.list({ fabric_category: category, status, search: q }), [category, status, q]);
  const suppliers = useLoad(() => supplierApi.list());

  return (
    <>
      <PageHeader
        eyebrow="Fabric"
        title="Fabric lots"
        subtitle="Every delivery, woven batch and LC shipment — the digital roll register."
        actions={
          <FormDialog
            disabled={!can("fabric_write")}
            trigger={<Button><Plus /> New lot</Button>}
            title="Receive a fabric lot"
            description="Register the lot first, then add its rolls (singly or in bulk)."
            submitLabel="Create lot"
            wide
            onSubmit={async (b) => {
              await lotApi.create(b);
              await lots.reload();
            }}
          >
            <TextInput label="Lot number" name="lot_number" required placeholder="FSD-W-2412" />
            <SelectInput label="Category" name="fabric_category" defaultValue="woven"
              options={CATEGORIES.filter(Boolean).map((c) => ({ value: c, label: humanize(c) }))} />
            <TextInput label="Fabric type" name="fabric_type" required placeholder="100% Cotton Poplin 40x40" className="sm:col-span-2" />
            <TextInput label="Colour" name="color" required placeholder="Greige" />
            <SelectInput label="Supplier" name="supplier_id" defaultValue=""
              options={[{ value: "", label: "— none / in-house —" }, ...(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
            <TextInput label="Total meters" name="total_meters" type="number" step="0.01" min="0" required />
            <TextInput label="Cost per meter (PKR)" name="cost_per_meter" type="number" step="0.01" min="0"
              hint="Leave blank if not yet invoiced — Mill Pulse will flag it." />
            <TextInput label="GSM" name="gsm" type="number" step="0.01" min="0" />
            <TextInput label="Width (cm)" name="width_cm" type="number" step="0.01" min="0" />
            <TextInput label="Received on" name="received_date" type="date" defaultValue={isoDate()} required />
            <TextInput label="Notes" name="notes" />
          </FormDialog>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Category" className="flex rounded-lg border bg-card p-0.5">
          {CATEGORIES.map((c) => (
            <button key={c || "all"} role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
              className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors",
                category === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {c ? humanize(c) : "All"}
            </button>
          ))}
        </div>
        <FilterSelect label="Status" value={status} onChange={setStatus}
          options={STATUSES.map((s) => ({ value: s, label: s ? humanize(s) : "Any status" }))} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input aria-label="Search lots" placeholder="Lot, fabric or colour…" className="pl-8" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {lots.error ? <ErrorNote message={lots.error} onRetry={lots.reload} /> : lots.loading && !lots.data ? <Skeleton /> : (
        <DataTable<FabricLot>
          rows={lots.data ?? []}
          empty={<EmptyState title="No lots match" hint="Try another filter, or receive a new lot." />}
          columns={[
            { header: "Lot", cell: (l) => (
              <Link href={`/fabric-lots/${l.id}`} className="font-medium text-primary hover:underline">{l.lot_number}</Link>
            ) },
            { header: "Fabric", cell: (l) => (
              <span className="block max-w-[16rem] truncate">{l.fabric_type} <span className="text-muted-foreground">· {l.color}</span></span>
            ) },
            { header: "Category", cell: (l) => humanize(l.fabric_category) },
            { header: "Supplier", cell: (l) => <span className="block max-w-[12rem] truncate">{l.supplier ?? "—"}</span> },
            { header: "Received", cell: (l) => formatDate(l.received_date) },
            { header: "Meters", align: "right", cell: (l) => formatMeters(l.total_meters) },
            { header: "Value", align: "right", cell: (l) => l.cost_per_meter
              ? formatPKR(num(l.total_meters) * num(l.cost_per_meter), true)
              : <span className="text-muted-foreground">not costed</span> },
            { header: "Status", cell: (l) => <StatusBadge status={l.status} /> },
          ]}
        />
      )}
    </>
  );
}
