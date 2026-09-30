"use client";

import { Plus } from "lucide-react";
import { DataTable, ErrorNote, FormDialog, PageHeader, SelectInput, Skeleton, StatusBadge, TextInput } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLoad } from "@/hooks/useLoad";
import { formatDate } from "@/lib/utils";
import { teamApi } from "@/services/erp";
import type { TeamMember } from "@/types";

const MATRIX: [string, string, boolean[]][] = [
  ["View stock, production & reports", "fabric_read", [true, true, true, true]],
  ["Receive lots, issue rolls, post yarn, log shifts", "fabric_write", [true, true, true, false]],
  ["Open / update LCs", "fabric_import_write", [true, true, false, true]],
  ["Manage suppliers", "fabric_supplier_write", [true, true, false, false]],
  ["Delete lots & rolls", "fabric_delete", [true, true, false, false]],
  ["Add team members", "user_manage", [true, false, false, false]],
];

export default function TeamPage() {
  const { can, user } = useAuth();
  const team = useLoad(() => teamApi.list());

  return (
    <>
      <PageHeader eyebrow="Business" title="Team & roles"
        subtitle="Four roles, enforced by the API on every request — the buttons you see are only a hint."
        actions={
          <FormDialog disabled={!can("user_manage")} trigger={<Button><Plus /> Add member</Button>}
            title="Add a team member" submitLabel="Create account"
            onSubmit={async (b) => { await teamApi.add(b); await team.reload(); }}>
            <TextInput label="Full name" name="full_name" required />
            <TextInput label="Email" name="email" type="email" required />
            <SelectInput label="Role" name="role" defaultValue="operator"
              options={["manager", "operator", "accountant"].map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))} />
            <TextInput label="Temporary password" name="password" type="password" minLength={8} required hint="At least 8 characters. Share it privately." />
          </FormDialog>
        }
      />
      {team.error ? <ErrorNote message={team.error} onRetry={team.reload} /> : team.loading && !team.data ? <Skeleton /> : (
        <DataTable<TeamMember>
          rows={team.data ?? []}
          columns={[
            { header: "Name", cell: (m) => <span className="font-medium">{m.full_name}{m.user_id === user?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}</span> },
            { header: "Email", cell: (m) => m.email },
            { header: "Role", cell: (m) => <StatusBadge status={m.role === "owner" ? "in_stock" : "reserved"} label={m.role} /> },
            { header: "Since", cell: (m) => formatDate(m.created_at) },
          ]}
        />
      )}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Permission matrix</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 text-left font-semibold">Action</th>
                {["Owner", "Manager", "Operator", "Accountant"].map((r) => <th key={r} className="px-3 py-2 text-center font-semibold">{r}</th>)}</tr>
            </thead>
            <tbody>
              {MATRIX.map(([label, key, cells]) => (
                <tr key={key} className="border-t">
                  <td className="px-3 py-2">{label} <code className="ml-1 text-[10px] text-muted-foreground">{key}</code></td>
                  {cells.map((ok, i) => <td key={i} className="px-3 py-2 text-center">{ok ? "✓" : <span className="text-muted-foreground">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
