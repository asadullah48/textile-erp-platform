"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    org_name: "",
    full_name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (form.org_name.length < 2) {
      setError("Company name must be at least 2 characters");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await register({
        org_name: form.org_name,
        industry: "fabric_mill",
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(
              [
                { id: "org_name", label: "Company name", type: "text" },
                { id: "full_name", label: "Your name", type: "text" },
                { id: "email", label: "Email", type: "email" },
                { id: "password", label: "Password", type: "password" },
                { id: "confirm", label: "Confirm password", type: "password" },
              ] as const
            ).map(({ id, label, type }) => (
              <div key={id}>
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type={type}
                  value={(form as Record<string, string>)[id]}
                  onChange={set(id)}
                  required
                />
              </div>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating…" : "Create workspace"}
            </Button>
            <p className="text-sm text-center">
              Already registered?{" "}
              <a href="/login" className="underline">
                Sign in
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
