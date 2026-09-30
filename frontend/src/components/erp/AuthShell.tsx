import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="weave hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">TE</span>
          <span className="text-sm font-semibold">Textile ERP</span>
        </Link>
        <blockquote className="max-w-md space-y-3">
          <p className="text-2xl font-medium leading-snug">Roll register, yarn book and LC file — one system, numbers that can&apos;t drift.</p>
          <p className="text-sm text-sidebar-foreground/70">Multi-tenant · PostgreSQL row-level security · role-based access</p>
        </blockquote>
        <p className="text-xs text-sidebar-foreground/50">Module 1 · Fabric Mill</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
