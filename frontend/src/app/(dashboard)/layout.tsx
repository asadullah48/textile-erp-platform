"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/fabric-lots", label: "Fabric Lots" },
  { href: "/fabric-rolls", label: "Fabric Rolls" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-slate-900 text-white flex flex-col p-4 gap-1">
        <p className="font-bold text-sm mb-4 truncate">{tenant?.org_name ?? "Loading…"}</p>
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`px-3 py-2 rounded text-sm transition-colors ${
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-slate-700"
                : "hover:bg-slate-800"
            }`}
          >
            {label}
          </Link>
        ))}
        <div className="mt-auto pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-400 truncate mb-2">{user?.email}</p>
          <Button variant="ghost" size="sm" className="w-full text-slate-300 hover:text-white" onClick={logout}>
            Logout
          </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 border-b flex items-center justify-between px-6 bg-white">
          <span className="text-sm font-medium text-gray-700">{tenant?.org_name}</span>
          <span className="text-xs text-gray-400">{user?.email}</span>
        </header>
        <main className="flex-1 overflow-auto p-6 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
