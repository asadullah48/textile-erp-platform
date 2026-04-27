import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })
}

export function formatMeters(n: number): string {
  return n.toLocaleString("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " m"
}

export function statusColor(status: string): "default" | "secondary" | "destructive" | "outline" {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    in_stock: "default",
    available: "default",
    pending: "secondary",
    reserved: "outline",
    partially_consumed: "outline",
    fully_consumed: "destructive",
    consumed: "destructive",
  }
  return map[status] ?? "secondary"
}
