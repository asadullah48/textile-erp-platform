"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fabricService } from "@/services/fabricService";
import type { FabricLotCreate } from "@/services/fabricService";
import type { FabricLot } from "@/types";
import { statusColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const EMPTY: FabricLotCreate = {
  lot_number: "",
  fabric_type: "",
  color: "",
  total_meters: 0,
  received_date: new Date().toISOString().split("T")[0],
  gsm: null,
  width_cm: null,
  supplier: null,
  status: "in_stock",
  notes: null,
};

export default function FabricLotsPage() {
  const [lots, setLots] = useState<FabricLot[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FabricLotCreate>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => fabricService.getLots().then(setLots);
  useEffect(() => {
    load();
  }, []);

  const set =
    (k: keyof FabricLotCreate) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fabricService.createLot(form);
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Error creating lot"
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteLot = async (id: string) => {
    if (!confirm("Delete this lot?")) return;
    await fabricService.deleteLot(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Fabric Lots</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>New Lot</DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Fabric Lot</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              {(
                [
                  { k: "lot_number", label: "Lot Number", type: "text", required: true },
                  { k: "fabric_type", label: "Fabric Type", type: "text", required: true },
                  { k: "color", label: "Color", type: "text", required: true },
                  { k: "total_meters", label: "Total Meters", type: "number", required: true },
                  { k: "received_date", label: "Received Date", type: "date", required: true },
                  { k: "gsm", label: "GSM", type: "number", required: false },
                  { k: "width_cm", label: "Width (cm)", type: "number", required: false },
                  { k: "supplier", label: "Supplier", type: "text", required: false },
                ] as const
              ).map(({ k, label, type, required }) => (
                <div key={k}>
                  <Label htmlFor={k}>{label}</Label>
                  <Input
                    id={k}
                    type={type}
                    value={String((form as Record<string, unknown>)[k] ?? "")}
                    onChange={set(k)}
                    required={required}
                  />
                </div>
              ))}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating…" : "Create Lot"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Lot #", "Fabric Type", "Color", "GSM", "Total m", "Status", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No lots yet. Create your first lot.
                </td>
              </tr>
            ) : (
              lots.map((l) => (
                <tr key={l.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/fabric-lots/${l.id}`} className="text-blue-600 hover:underline font-medium">
                      {l.lot_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{l.fabric_type}</td>
                  <td className="px-4 py-3">{l.color}</td>
                  <td className="px-4 py-3">{l.gsm ?? "—"}</td>
                  <td className="px-4 py-3">{Number(l.total_meters).toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusColor(l.status)}>{l.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteLot(l.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
