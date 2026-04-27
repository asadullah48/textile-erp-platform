"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import api from "@/lib/api";
import type { User, Tenant } from "@/types";

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (data: RegisterData) => Promise<void>;
}

interface RegisterData {
  org_name: string;
  industry: string;
  full_name: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (stored) setToken(stored);
    setIsLoading(false);
  }, []);

  const _persist = (data: { access_token: string; user: User; tenant: Tenant }) => {
    localStorage.setItem("access_token", data.access_token);
    document.cookie = `access_token=${data.access_token}; path=/; SameSite=Lax`;
    setToken(data.access_token);
    setUser(data.user);
    setTenant(data.tenant);
  };

  const login = async (email: string, password: string) => {
    const res = await api.post("/api/v1/auth/login", { email, password });
    _persist(res.data);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setToken(null);
    setUser(null);
    setTenant(null);
    window.location.href = "/login";
  };

  const register = async (data: RegisterData) => {
    const res = await api.post("/api/v1/auth/register-tenant", data);
    _persist(res.data);
  };

  return (
    <AuthContext.Provider value={{ user, tenant, token, isLoading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
