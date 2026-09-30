"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, Boxes, Cable, Factory, FileBarChart, Gauge, LogOut, Menu, RotateCcw, Ship, Truck, Users, Waves, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BROWSER_DEMO } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const NAV = [
  { group: "Overview", items: [{ href: "/dashboard", label: "Mill Pulse", icon: Gauge }] },
  {
    group: "Fabric",
    items: [
      { href: "/fabric-lots", label: "Lots", icon: Boxes },
      { href: "/fabric-rolls", label: "Rolls & issuing", icon: Cable },
      { href: "/imports", label: "LC imports", icon: Ship },
    ],
  },
  {
    group: "Production",
    items: [
      { href: "/yarn", label: "Yarn stock", icon: Activity },
      { href: "/weaving", label: "Weaving", icon: Factory },
      { href: "/knitting", label: "Knitting", icon: Waves },
    ],
  },
  {
    group: "Business",
    items: [
      { href: "/suppliers", label: "Suppliers", icon: Truck },
      { href: "/reports", label: "Reports", icon: FileBarChart },
      { href: "/team", label: "Team & roles", icon: Users, perm: "team_view" },
    ],
  },
];

const ROLES: Role[] = ["owner", "manager", "operator", "accountant"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, logout, isLoading, can, switchDemoRole, resetDemoData } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!isLoading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, user, router, pathname]);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="weave border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">TE</span>
          <span className="text-sm font-semibold tracking-tight">Textile ERP</span>
        </Link>
        <p className="mt-2 truncate text-xs text-sidebar-foreground/70" title={tenant?.org_name}>{tenant?.org_name ?? " "}</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.filter((i) => !("perm" in i) || can(i.perm as string)).map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <Link href={href} aria-current={active ? "page" : undefined}
                      className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")}>
                      <Icon className={cn("size-4", active && "text-sidebar-primary")} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-sidebar-border p-3">
        <p className="truncate text-xs font-medium">{user?.full_name}</p>
        <p className="truncate text-[11px] text-sidebar-foreground/60"><span className="capitalize">{user?.role}</span> · {user?.email}</p>
        <button onClick={logout} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent">
          <LogOut className="size-3.5" /> {tenant?.is_demo ? "Leave demo" : "Sign out"}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {tenant?.is_demo && (
          <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-accent px-4 py-2 text-xs text-accent-foreground lg:px-8">
            <span className="font-medium">
              {BROWSER_DEMO
                ? "Live demo · sample Faisalabad mill · runs entirely in your browser — nothing you enter leaves this device."
                : "Demo workspace · private to you · deleted automatically after 24 hours."}
            </span>
            {BROWSER_DEMO && (
              <span className="flex items-center gap-2">
                <label htmlFor="role" className="opacity-80">View as</label>
                <select id="role" value={user?.role ?? "owner"} onChange={(e) => switchDemoRole(e.target.value as Role)}
                  className="h-6 rounded border border-accent-foreground/20 bg-card px-1.5 text-xs capitalize">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={() => { if (confirm("Reset the demo mill to its original data?")) resetDemoData().then(() => router.refresh()); }}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-card/60">
                  <RotateCcw className="size-3" /> Reset
                </button>
              </span>
            )}
          </div>
        )}
        <header className="no-print flex h-12 items-center gap-3 border-b bg-card/70 px-4 backdrop-blur lg:hidden">
          <button aria-label="Open menu" onClick={() => setMobileOpen(true)} className="rounded p-1 hover:bg-muted">
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="truncate text-sm font-semibold">{tenant?.org_name}</span>
        </header>
        <main key={user?.role} className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 lg:px-8">
          {isLoading || !user ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : children}
        </main>
      </div>
    </div>
  );
}
