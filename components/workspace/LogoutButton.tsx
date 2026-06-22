"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Clears the session cookie and returns to the login screen. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Failed to sign out");
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={logout}
      disabled={busy}
      className="w-full justify-start text-muted-foreground"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      Sign out
    </Button>
  );
}
