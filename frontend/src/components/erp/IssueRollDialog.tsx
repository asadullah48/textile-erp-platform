"use client";

import { Button } from "@/components/ui/button";
import { FormDialog, SelectInput, TextInput } from "@/components/erp/kit";
import { formatMeters, isoDate, num } from "@/lib/utils";
import { rollApi } from "@/services/erp";
import type { FabricRoll } from "@/types";

const DEPARTMENTS = ["cutting", "stitching", "finishing", "packing", "dyeing", "sampling", "sale"];

/** Issue all or part of a roll to a department / CMT order. */
export function IssueRollDialog({ roll, onDone, disabled }: { roll: FabricRoll; onDone: () => unknown; disabled?: boolean }) {
  const remaining = num(roll.remaining_meters);
  if (remaining <= 0) return <span className="text-xs text-muted-foreground">fully issued</span>;
  return (
    <FormDialog
      disabled={disabled}
      trigger={<Button size="xs" variant="outline">Issue</Button>}
      title={`Issue roll ${roll.roll_number}`}
      description={`${formatMeters(remaining, 2)} remaining. Leave meters blank to issue the whole roll.`}
      submitLabel="Issue fabric"
      onSubmit={async (b) => {
        await rollApi.issue(roll.id, b);
        await onDone();
      }}
    >
      <SelectInput label="Issue to" name="issued_to_department" defaultValue="cutting"
        options={DEPARTMENTS.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))} />
      <TextInput label="Meters" name="issued_meters" type="number" step="0.01" min="0.01" max={remaining}
        placeholder={`${remaining} (whole roll)`} />
      <TextInput label="CMT order ref." name="cmt_order_reference" placeholder="PO-SIA-1182"
        hint={roll.status === "reserved" ? "Required: this roll is reserved for an order." : undefined}
        required={roll.status === "reserved"} />
      <TextInput label="Issue date" name="issued_date" type="date" defaultValue={isoDate()} />
    </FormDialog>
  );
}
