"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ChevronLeft, Printer } from "lucide-react";
import { ErrorNote, Skeleton } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useLoad } from "@/hooks/useLoad";
import { formatMeters, num } from "@/lib/utils";
import { lotApi } from "@/services/erp";

/** A4 sheet of roll labels. Each QR opens that roll's traceability page. */
export default function RollLabelsPage() {
  const { lotId } = useParams<{ lotId: string }>();
  const { data, error, loading, reload } = useLoad(async () => {
    const [lot, rolls] = await Promise.all([lotApi.get(lotId), lotApi.rolls(lotId)]);
    return { lot, rolls: rolls.filter((r) => num(r.remaining_meters) > 0) };
  }, [lotId]);
  const [qr, setQr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    const origin = window.location.origin;
    Promise.all(data.rolls.map(async (r) =>
      [r.id, await QRCode.toDataURL(`${origin}/fabric-rolls/${r.id}`, { margin: 0, width: 160, errorCorrectionLevel: "M" })] as const,
    )).then((pairs) => setQr(Object.fromEntries(pairs)));
  }, [data]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton />;
  const { lot, rolls } = data;

  return (
    <>
      <div className="no-print flex items-center justify-between">
        <Link href={`/fabric-lots/${lot.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> {lot.lot_number}
        </Link>
        <Button onClick={() => window.print()}><Printer /> Print {rolls.length} labels</Button>
      </div>
      <p className="no-print text-sm text-muted-foreground">
        Rolls with stock remaining. Scanning a label on the rack opens the roll&apos;s full trace — supplier, LC, looms and every issue.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
        {rolls.map((r) => (
          <div key={r.id} className="flex break-inside-avoid gap-3 rounded-md border border-dashed bg-white p-3 text-black">
            {qr[r.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr[r.id]} alt={`QR for roll ${r.roll_number}`} className="size-20 shrink-0" />
            ) : <div className="size-20 shrink-0 animate-pulse bg-muted" />}
            <div className="min-w-0 text-[11px] leading-tight">
              <p className="font-mono text-sm font-bold">{r.roll_number}</p>
              <p className="mt-1 truncate">{lot.fabric_type}</p>
              <p className="truncate">{lot.color} · Lot {lot.lot_number}</p>
              <p className="num mt-1 font-semibold">{formatMeters(r.remaining_meters, 1)}{r.grade ? ` · Grade ${r.grade}` : ""}</p>
              {r.location && <p className="truncate text-neutral-600">{r.location}</p>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
