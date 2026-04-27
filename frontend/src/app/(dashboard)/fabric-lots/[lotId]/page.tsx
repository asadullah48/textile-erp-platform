"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fabricService } from "@/services/fabricService";
import type { FabricRollCreate } from "@/services/fabricService";
import type { FabricLot, FabricRoll, FabricLotSummary } from "@/types";
import { statusColor } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLL_EMPTY: FabricRollCreate = {
  roll_number: "",
  length_meters: 0,
  weight_kg: null,
  status: "available",
  location: null,
};

export default function LotDetailPage() {
  const { lotId } = useParams<{ lotId: string }>();
  const [lot, setLot] = useState<FabricLot | null>(null);
  const [rolls, setRolls] = useState<FabricRoll[]>([]);
  const [summary, setSummary] = useState<FabricLotSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FabricRollCreate>(ROLL_EMPTY);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [l, r, s] = await Promise.all([
      fabricService.getLot(lotId),
      fabricService.getRolls(lotId),
      fabricService.getLotSummary(lotId),
    ]);
    setLot(l);
    setRolls(r);
    setSummary(s);
  };

  useEffect(() => {
    load();
  }, [lotId]);

  const set =
    (k: keyof FabricRollCreate) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const addRoll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await fabricService.createRoll(lotId, form);
      setOpen(false);
      setForm(ROLL_EMPTY);
      load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Error adding roll"
      );
    }
  };

  if (!lot) {
    return <p className="text-gray-500">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{lot.lot_number}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {lot.fabric_type} · {lot.color}{lot.gsm ? ` · ${lot.gsm} GSM` : ""}
          {lot.supplier ? ` · ${lot.supplier}` : ""}
        </p>
        <Badge className="mt-2" variant={statusColor(lot.status)}>
          {lot.status.replace(/_/g, " ")}
        </Badge>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "Total Rolls", value: summary.roll_count },
            { label: "Total Meters", value: Number(summary.total_meters).toFixed(1) + " m" },
            { label: "Available", value: Number(summary.meters_available).toFixed(1) + " m" },
            { label: "Reserved", value: Number(summary.meters_reserved).toFixed(1) + " m" },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-gray-500 font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Rolls</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" />}>Add Roll</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Roll to {lot.lot_number}</DialogTitle>
            </DialogHeader>
            <form onSubmit={addRoll} className="space-y-3">
              {(
                [
                  { k: "roll_number", label: "Roll Number", type: "text", required: true },
                  { k: "length_meters", label: "Length (m)", type: "number", required: true },
                  { k: "weight_kg", label: "Weight (kg)", type: "number", required: false },
                  { k: "location", label: "Location", type: "text", required: false },
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
              <Button type="submit" className="w-full">
                Add Roll
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Roll #", "Length (m)", "Weight (kg)", "Status", "Location"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rolls.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No rolls yet.
                </td>
              </tr>
            ) : (
              rolls.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.roll_number}</td>
                  <td className="px-4 py-3">{Number(r.length_meters).toFixed(2)}</td>
                  <td className="px-4 py-3">{r.weight_kg ? Number(r.weight_kg).toFixed(3) : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusColor(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{r.location ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
