"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, EmptyState, ErrorNote, FormDialog, PageHeader, Skeleton, StatCard, TextInput } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { cn, formatMeters, formatPKR } from "@/lib/utils";
import { supplierApi } from "@/services/erp";
import type { Supplier } from "@/types";

export default function SuppliersPage() {
  const { can } = useAuth();
  const list = useLoad(() => supplierApi.list());
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useLoad(() => (selected ? supplierApi.get(selected) : Promise.resolve(null)), [selected]);

  return (
    <>
      <PageHeader eyebrow="Business" title="Suppliers"
        subtitle="Yarn traders, greige houses and overseas mills — with what you've actually bought from each."
        actions={
          <FormDialog disabled={!can("fabric_supplier_write")} trigger={<Button><Plus /> Add supplier</Button>}
            title="Add supplier" submitLabel="Save supplier" wide
            onSubmit={async (b) => { await supplierApi.create(b); await list.reload(); }}>
            <TextInput label="Name" name="name" required className="sm:col-span-2" />
            <TextInput label="Contact person" name="contact_person" />
            <TextInput label="Phone" name="phone" placeholder="+92 41 …" />
            <TextInput label="City" name="city" />
            <TextInput label="Country (ISO-2)" name="country" defaultValue="PK" maxLength={2} />
            <TextInput label="Payment terms" name="payment_terms" placeholder="30 days / 90 days LC" />
            <TextInput label="Email" name="email" type="email" />
          </FormDialog>
        }
      />
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Skeleton /> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DataTable<Supplier>
              rows={list.data ?? []}
              onRowClick={(s) => setSelected(s.id)}
              empty={<EmptyState title="No suppliers yet" />}
              columns={[
                { header: "Supplier", cell: (s) => <span className={cn("font-medium", selected === s.id && "text-primary")}>{s.name}</span> },
                { header: "Contact", cell: (s) => s.contact_person ?? "—" },
                { header: "Location", cell: (s) => [s.city, s.country].filter(Boolean).join(", ") },
                { header: "Terms", cell: (s) => s.payment_terms ?? "—" },
              ]}
            />
          </div>
          <aside className="space-y-3">
            {!selected ? (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Select a supplier to see what you have bought from them.</p>
            ) : detail.loading || !detail.data ? <Skeleton rows={3} /> : (
              <>
                <h2 className="text-base font-semibold">{detail.data.name}</h2>
                <p className="text-xs text-muted-foreground">{detail.data.phone ?? ""} {detail.data.notes ? `· ${detail.data.notes}` : ""}</p>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Lots received" value={detail.data.stats.lots_received} />
                  <StatCard label="Meters received" value={formatMeters(detail.data.stats.meters_received)} />
                  <StatCard label="Purchase value" value={formatPKR(detail.data.stats.purchase_value_pkr, true)} />
                  <StatCard label="Open LCs" value={detail.data.stats.open_imports} />
                </div>
                <p className="text-xs text-muted-foreground">Supplies {detail.data.stats.yarn_types_supplied} yarn count(s). Payable balances arrive with the Party Ledger module.</p>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
