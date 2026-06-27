"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, UserPlus } from "lucide-react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getAuth } from "firebase/auth";
import { getClientApp } from "@/firebase-services/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "signup";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [mode, setMode] = useState<Mode>("login");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || submitting) return;
    if (mode === "signup" && (!firstName || !lastName)) return;
    
    setSubmitting(true);
    setError(null);

    try {
      const auth = getAuth(getClientApp());
      
      if (mode === "login") {
        // 1. Sign in with Firebase Auth (email + password).
        const credential = await signInWithEmailAndPassword(auth, email, password);

        // 2. Get the ID token and send it to our server to get a session cookie.
        const idToken = await credential.user.getIdToken();
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            uid: credential.user.uid,
            email: credential.user.email ?? email,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Sign in failed");
          setSubmitting(false);
          return;
        }
      } else {
        // 1. Sign up with Firebase Auth (email + password).
        const credential = await createUserWithEmailAndPassword(auth, email, password);

        // 2. Get the ID token and send it to our server to get a session cookie + create user record.
        const idToken = await credential.user.getIdToken();
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            uid: credential.user.uid,
            email: credential.user.email ?? email,
            firstName,
            lastName,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Sign up failed");
          setSubmitting(false);
          return;
        }
      }

      // 3. Navigate to the app.
      const from = searchParams.get("from");
      router.replace(from && from.startsWith("/") ? from : "/");
      router.refresh();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found" ||
        code === "auth/invalid-email"
      ) {
        setError("Incorrect email or password");
      } else if (code === "auth/email-already-in-use") {
        setError("Email already in use");
      } else if (code === "auth/weak-password") {
        setError("Password should be at least 6 characters");
      } else {
        setError(mode === "login" ? "Sign in failed — please try again" : "Sign up failed — please try again");
      }
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
          {mode === "login" ? <Lock className="size-5" /> : <UserPlus className="size-5" />}
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Data Mng</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Sign in to continue" : "Create an account to continue"}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
                placeholder="Doe"
              />
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoFocus={mode === "login"}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            placeholder="you@example.com"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(error)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={
          submitting || 
          !email || 
          !password || 
          (mode === "signup" && (!firstName || !lastName))
        }
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {mode === "login" ? "Sign in" : "Sign up"}
      </Button>

      <div className="text-center text-sm">
        {mode === "login" ? (
          <span className="text-muted-foreground">
            Don't have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              disabled={submitting}
            >
              Sign up
            </button>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              disabled={submitting}
            >
              Sign in
            </button>
          </span>
        )}
      </div>
    </form>
  );
}
