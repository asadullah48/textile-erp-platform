import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** API decimals arrive as strings; convert once, at the edge. */
export const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export const formatMeters = (v: string | number | null | undefined, dp = 0) =>
  `${num(v).toLocaleString("en-PK", { minimumFractionDigits: dp, maximumFractionDigits: dp })} m`;

export const formatKg = (v: string | number | null | undefined, dp = 0) =>
  `${num(v).toLocaleString("en-PK", { minimumFractionDigits: dp, maximumFractionDigits: dp })} kg`;

/** PKR with lakh/crore compaction — how mill owners actually read money. */
export function formatPKR(v: string | number | null | undefined, compact = false): string {
  const x = num(v);
  if (compact) {
    if (Math.abs(x) >= 1e7) return `PKR ${(x / 1e7).toFixed(2)} Cr`;
    if (Math.abs(x) >= 1e5) return `PKR ${(x / 1e5).toFixed(1)} Lac`;
  }
  return `PKR ${Math.round(x).toLocaleString("en-PK")}`;
}

export const humanize = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);
export const daysAgoIso = (days: number) => isoDate(new Date(Date.now() - days * 86_400_000));
export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000);

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "muted";
const TONES: Record<string, Tone> = {
  in_stock: "ok", available: "ok", warehoused: "ok", A: "ok",
  pending: "muted", in_transit: "info", reserved: "info",
  partially_consumed: "warn", issued: "warn", cleared: "warn", B: "warn",
  fully_consumed: "neutral", consumed: "neutral", C: "bad",
};
export const toneFor = (status: string): Tone => TONES[status] ?? "neutral";
