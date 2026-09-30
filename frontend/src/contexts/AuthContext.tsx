"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { BROWSER_DEMO } from "@/lib/api";
import { resetDemo, setDemoRole } from "@/lib/demo/adapter";
import { authApi } from "@/services/erp";
import type { Me, Role, Tenant, Token, User } from "@/types";

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  permissions: string[];
  isLoading: boolean;
  can: (permission: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  enterDemo: () => Promise<void>;
  switchDemoRole: (role: Role) => Promise<void>;
  resetDemoData: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function persistToken(token: string) {
  localStorage.setItem("access_token", token);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `access_token=${token}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax${secure}`;
}

function clearToken() {
  localStorage.removeItem("access_token");
  document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The token alone is not a session: on every load, re-hydrate user, tenant
  // and permissions from /auth/me (fixes the "Loading…" sidebar after refresh).
  const refresh = useCallback(async () => {
    try {
      setMe(await authApi.me());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setIsLoading(false);
      return;
    }
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const start = async (t: Token) => {
    persistToken(t.access_token);
    await refresh();
  };

  const value: AuthState = {
    user: me ? { id: me.id, email: me.email, full_name: me.full_name, role: me.role } : null,
    tenant: me?.tenant ?? null,
    permissions: me?.permissions ?? [],
    isLoading,
    can: (p) => !!me?.permissions.includes(p),
    login: async (email, password) => start(await authApi.login(email, password)),
    register: async (data) => start(await authApi.register(data)),
    enterDemo: async () => start(await authApi.demo()),
    switchDemoRole: async (role) => {
      if (!BROWSER_DEMO) return;
      setDemoRole(role);
      await refresh();
    },
    resetDemoData: async () => {
      if (!BROWSER_DEMO) return;
      resetDemo(me?.role ?? "owner");
      await refresh();
    },
    logout: () => {
      clearToken();
      setMe(null);
      window.location.href = "/";
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
