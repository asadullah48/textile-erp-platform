"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertTriangle, Info, OctagonAlert, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, humanize, toneFor } from "@/lib/utils";
import { apiError } from "@/services/erp";
import type { Insight } from "@/types";

export function PageHeader({ title, subtitle, actions, eyebrow }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "bad" | "ok";
}) {
  return (
    <div className={cn(
      "rounded-lg border bg-card p-4",
      tone === "warn" && "border-l-4 border-l-[var(--warn)]",
      tone === "bad" && "border-l-4 border-l-destructive",
      tone === "ok" && "border-l-4 border-l-[var(--ok)]",
    )}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const TONE_CLASS = {
  ok: "bg-[color-mix(in_oklch,var(--ok)_14%,white)] text-[color-mix(in_oklch,var(--ok)_80%,black)] border-[color-mix(in_oklch,var(--ok)_30%,white)]",
  warn: "bg-[color-mix(in_oklch,var(--warn)_18%,white)] text-[color-mix(in_oklch,var(--warn)_55%,black)] border-[color-mix(in_oklch,var(--warn)_40%,white)]",
  bad: "bg-destructive/10 text-destructive border-destructive/25",
  info: "bg-primary/8 text-primary border-primary/20",
  muted: "bg-muted text-muted-foreground border-border",
  neutral: "bg-secondary text-secondary-foreground border-border",
} as const;

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center whitespace-nowrap rounded-full border px-2 text-[11px] font-medium", TONE_CLASS[toneFor(status)])}>
      {label ?? humanize(status)}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/60 px-6 py-12 text-center">
      <PackageOpen className="size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- table */

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "right";
}

export function DataTable<T extends { id?: string }>({ rows, columns, empty, rowKey, onRowClick }: {
  rows: T[]; columns: Column<T>[]; empty?: ReactNode; rowKey?: (r: T) => string; onRowClick?: (r: T) => void;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/60">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col"
                className={cn("whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground", c.align === "right" && "text-right", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : r.id ?? i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn("border-t transition-colors hover:bg-muted/40", onRowClick && "cursor-pointer")}>
              {columns.map((c) => (
                <td key={c.header} className={cn("px-3 py-2.5 align-middle", c.align === "right" && "num text-right", c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- forms */

export function Field({ label, htmlFor, hint, children, className }: {
  label: string; htmlFor: string; hint?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.ComponentProps<typeof Input> & { label: string; name: string; hint?: string }) {
  const { label, hint, className, ...rest } = props;
  return (
    <Field label={label} htmlFor={rest.name} hint={hint} className={className}>
      <Input id={rest.name} {...rest} />
    </Field>
  );
}

export function SelectInput({ label, name, options, hint, className, ...rest }: React.ComponentProps<"select"> & {
  label: string; name: string; hint?: string; options: { value: string; label: string }[];
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint} className={className}>
      <select id={name} name={name} {...rest}
        className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function FilterSelect({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Collects a <form>'s named fields, dropping blanks so optional API fields stay unset. */
export function formBody(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((v, k) => {
    const s = String(v).trim();
    if (s !== "") out[k] = s;
  });
  return out;
}

export function FormDialog({ trigger, title, description, submitLabel, onSubmit, children, wide, disabled }: {
  trigger: ReactNode; title: string; description?: string; submitLabel: string;
  onSubmit: (body: Record<string, string>) => Promise<unknown>; children: ReactNode; wide?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (disabled) return null;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(formBody(e.currentTarget));
      setOpen(false);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className={cn(wide ? "sm:max-w-2xl" : "sm:max-w-md", "max-h-[90vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className={cn("grid gap-3", wide && "sm:grid-cols-2")}>{children}</div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- insights */

const SEV = {
  critical: { icon: OctagonAlert, cls: "border-destructive/30 bg-destructive/5", iconCls: "text-destructive", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "border-[color-mix(in_oklch,var(--warn)_45%,white)] bg-[color-mix(in_oklch,var(--warn)_9%,white)]", iconCls: "text-[color-mix(in_oklch,var(--warn)_70%,black)]", label: "Warning" },
  info: { icon: Info, cls: "border-primary/20 bg-primary/5", iconCls: "text-primary", label: "Info" },
} as const;

export function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const s = SEV[insight.severity];
  const Icon = s.icon;
  const body = (
    <div className={cn("flex gap-3 rounded-lg border p-3 transition-colors", s.cls, insight.href && "hover:brightness-[0.98]")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", s.iconCls)} aria-label={s.label} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium leading-snug">{insight.title}</p>
        {!compact && <p className="text-xs text-muted-foreground">{insight.detail}</p>}
        {!compact && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Object.entries(insight.evidence).map(([k, v]) => (
              <span key={k} className="num rounded border bg-card/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {k}={v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  return insight.href ? <Link href={insight.href} className="block">{body}</Link> : body;
}

/* ---------------------------------------------------------------- bars */

export function BarList({ items, format, max }: {
  items: { label: string; value: number; sub?: string }[]; format: (v: number) => string; max?: number;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">{i.label}{i.sub && <span className="ml-1.5 font-normal text-muted-foreground">{i.sub}</span>}</span>
            <span className="num text-muted-foreground">{format(i.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (i.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
