"use client";

import { useState, useRef } from "react";
import { DatabaseZap, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { migrationApi, type MigrationProgress } from "@/lib/api-client";
import type { UserRecord } from "@/types";

type State = "idle" | "running" | "done" | "error";

export function MigrateDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: UserRecord | null;
}) {
  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const runningRef = useRef(false);

  async function run() {
    if (runningRef.current) return;
    runningRef.current = true;
    setState("running");
    setProgress(null);
    setErrorMsg(null);

    try {
      const createdBy = user
        ? {
            id: user.id,
            name: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
          }
        : null;

      const result = await migrationApi.run(createdBy, (p) => setProgress({ ...p }));
      setProgress(result);
      setState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Migration failed");
      setState("error");
    } finally {
      runningRef.current = false;
    }
  }

  function handleClose(o: boolean) {
    if (state === "running") return; // block closing while running
    onOpenChange(o);
    if (!o) {
      // reset for next open
      setState("idle");
      setProgress(null);
      setErrorMsg(null);
    }
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseZap className="size-4 text-primary" />
            Migrate legacy questions
          </DialogTitle>
          <DialogDescription>
            Copies every document from the flat <code className="rounded bg-muted px-1 text-xs">questions</code>{" "}
            collection into its folder-named collection (e.g.{" "}
            <code className="rounded bg-muted px-1 text-xs">javascript</code>) and writes a{" "}
            <code className="rounded bg-muted px-1 text-xs">_qindex</code> entry.
            Already-migrated documents are skipped — safe to run multiple times.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current user context */}
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">createdBy will be set to: </span>
            <span className="font-medium">
              {user
                ? user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.email
                : "anonymous"}
            </span>
          </div>

          {/* Progress bar */}
          {progress !== null && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress.done} / {progress.total} processed</span>
                <span>{pct}%</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border bg-emerald-500/10 px-2 py-1.5">
                  <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{progress.migrated}</p>
                  <p className="text-muted-foreground">Migrated</p>
                </div>
                <div className="rounded-md border bg-amber-500/10 px-2 py-1.5">
                  <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{progress.skipped}</p>
                  <p className="text-muted-foreground">Skipped</p>
                </div>
                <div className="rounded-md border bg-destructive/10 px-2 py-1.5">
                  <p className="text-lg font-semibold text-destructive">{progress.errors}</p>
                  <p className="text-muted-foreground">Errors</p>
                </div>
              </div>
            </div>
          )}

          {/* Status badges */}
          {state === "done" && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              Migration complete! Reload the page to see migrated questions.
            </div>
          )}
          {state === "error" && errorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {errorMsg}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={state === "running"}
          >
            {state === "done" ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={run}
            disabled={state === "running" || state === "done"}
          >
            {state === "running" && <Loader2 className="size-4 animate-spin" />}
            {state === "idle" && "Run migration"}
            {state === "running" && "Migrating…"}
            {state === "done" && "Done"}
            {state === "error" && "Retry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
