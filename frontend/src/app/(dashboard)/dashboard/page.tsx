"use client";

import { useEffect, useState } from "react";
import { fabricService } from "@/services/fabricService";
import type { FabricLot, FabricRoll } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const [lots, setLots] = useState<FabricLot[]>([]);
  const [rolls, setRolls] = useState<FabricRoll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fabricService.getLots(), fabricService.getRolls()]).then(([l, r]) => {
      setLots(l);
      setRolls(r);
      setLoading(false);
    });
  }, []);

  const metersAvailable = rolls
    .filter((r) => r.status === "available")
    .reduce((sum, r) => sum + Number(r.length_meters), 0);
  const metersReserved = rolls
    .filter((r) => r.status === "reserved")
    .reduce((sum, r) => sum + Number(r.length_meters), 0);

  const stats = [
    { label: "Total Lots", value: lots.length },
    { label: "Total Rolls", value: rolls.length },
    { label: "Meters Available", value: metersAvailable.toFixed(1) + " m" },
    { label: "Meters Reserved", value: metersReserved.toFixed(1) + " m" },
  ];

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-1">
                <div className="h-3 bg-gray-200 rounded animate-pulse w-24" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-gray-500 font-medium">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
