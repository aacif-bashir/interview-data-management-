"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Sign in failed");
        setSubmitting(false);
        return;
      }
      // Land on where the user was headed, or the home page.
      const from = searchParams.get("from");
      router.replace(from && from.startsWith("/") ? from : "/");
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-sm"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Lock className="size-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Data Mng</h1>
          <p className="text-sm text-muted-foreground">
            Enter the password to continue
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={submitting || !password}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}
