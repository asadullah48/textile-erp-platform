"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/erp/AuthShell";
import { SelectInput, TextInput, formBody } from "@/components/erp/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { BROWSER_DEMO } from "@/lib/api";
import { apiError } from "@/services/erp";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (BROWSER_DEMO) {
    return (
      <AuthShell title="Create a workspace" subtitle="Registration needs the production API.">
        <p className="text-sm text-muted-foreground">
          This public deployment is a browser demo with a pre-seeded mill. To register real workspaces, run the full stack
          (<code>docker compose up</code>) or deploy the backend — see the README.
        </p>
        <Button className="w-full" render={<Link href="/login" />} nativeButton={false}>Open the demo instead</Button>
      </AuthShell>
    );
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(formBody(e.currentTarget));
      router.push("/dashboard");
    } catch (err) {
      setError(apiError(err, "Registration failed"));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your mill's workspace" subtitle="You'll be the owner and can invite managers, operators and accountants.">
      <form onSubmit={submit} className="space-y-3">
        <TextInput label="Organisation" name="org_name" required placeholder="Chenab Weaving Mills" />
        <SelectInput label="Business type" name="industry" defaultValue="fabric_mill" options={[
          { value: "fabric_mill", label: "Fabric mill / weaving unit" }, { value: "cmt", label: "CMT / stitching unit" },
          { value: "export_house", label: "Export house" }, { value: "brand", label: "Brand" },
        ]} />
        <TextInput label="City" name="city" placeholder="Faisalabad" />
        <TextInput label="Your name" name="full_name" required />
        <TextInput label="Email" name="email" type="email" autoComplete="email" required />
        <TextInput label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-9 w-full" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already registered? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
