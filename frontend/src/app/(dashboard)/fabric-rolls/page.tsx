"use client";

import { useEffect, useState } from "react";
import { fabricService } from "@/services/fabricService";
import type { FabricRoll } from "@/types";
import { statusColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function FabricRollsPage() {
  const [rolls, setRolls] = useState<FabricRoll[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fabricService.getRolls().then(setRolls);
  }, []);

  const displayed = filter === "all" ? rolls : rolls.filter((r) => r.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Fabric Rolls</h1>
        <Select value={filter} onValueChange={(v) => setFilter(v ?? "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="consumed">Consumed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Roll #", "Lot ID", "Length (m)", "Weight (kg)", "Status", "Location"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No rolls found.
                </td>
              </tr>
            ) : (
              displayed.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.roll_number}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.lot_id.slice(0, 8)}…</td>
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
