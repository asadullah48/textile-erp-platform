"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/erp/AuthShell";
import { TextInput } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { BROWSER_DEMO } from "@/lib/api";
import { apiError } from "@/services/erp";

function safeNext(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

function LoginForm() {
  const { login, enterDemo } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"login" | "demo" | null>(null);

  const demo = async () => {
    setBusy("demo");
    setError(null);
    try { await enterDemo(); router.push(next); }
    catch (e) { setError(apiError(e, "Could not start the demo")); setBusy(null); }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("login");
    setError(null);
    try { await login(String(f.get("email")), String(f.get("password"))); router.push(next); }
    catch (err) { setError(apiError(err, "Sign-in failed")); setBusy(null); }
  };

  if (BROWSER_DEMO) {
    return (
      <AuthShell title="Live demo" subtitle="A seeded Faisalabad mill that runs entirely in your browser — no account needed.">
        <Button className="h-10 w-full" onClick={demo} disabled={!!busy}>{busy ? "Opening the mill…" : "Enter the demo"}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Sign-in and workspace registration run against the production API (FastAPI + PostgreSQL). See the repository&apos;s README to run the full stack.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Welcome back to your mill.">
      <form onSubmit={submit} className="space-y-3">
        <TextInput label="Email" name="email" type="email" autoComplete="email" required />
        <TextInput label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-9 w-full" disabled={!!busy}>{busy === "login" ? "Signing in…" : "Sign in"}</Button>
      </form>
      <div className="relative text-center text-xs text-muted-foreground">
        <span className="relative z-10 bg-background px-2">or</span>
        <span className="absolute inset-x-0 top-1/2 -z-0 border-t" />
      </div>
      <Button variant="outline" className="h-9 w-full" onClick={demo} disabled={!!busy}>
        {busy === "demo" ? "Seeding your demo mill…" : "Try a private demo workspace"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New mill? <Link href="/register" className="font-medium text-primary hover:underline">Create a workspace</Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
