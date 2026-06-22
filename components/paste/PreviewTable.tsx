"use client";

import { ArrowUpToLine, Plus, Trash2, CopyCheck } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { zipRows } from "@/lib/paste/zip";
import type { DuplicateMatch } from "@/types";

type Column = "q" | "a";

/**
 * Editable Q | A reconciliation table. Each column can be edited independently
 * so the user can realign offsets when the auto-split produced a mismatch.
 */
export function PreviewTable({
  questions,
  answers,
  onChange,
  duplicates,
}: {
  questions: string[];
  answers: string[];
  onChange: (questions: string[], answers: string[]) => void;
  /** Row index -> matching existing questions (advisory duplicate flag). */
  duplicates?: Map<number, DuplicateMatch>;
}) {
  const rows = zipRows(questions, answers);

  function colArray(col: Column) {
    return col === "q" ? questions : answers;
  }
  function setCol(col: Column, next: string[]) {
    if (col === "q") onChange(next, answers);
    else onChange(questions, next);
  }

  // Edit a single cell's text.
  function editCell(col: Column, i: number, text: string) {
    const arr = [...colArray(col)];
    // Pad with empty strings if editing past current length (unmatched cell).
    while (arr.length <= i) arr.push("");
    arr[i] = text;
    setCol(col, arr);
  }

  // Merge cell i into i-1 (joined with a blank line), removing row i in this col.
  function mergeUp(col: Column, i: number) {
    if (i === 0) return;
    const arr = [...colArray(col)];
    arr[i - 1] = `${arr[i - 1] ?? ""}\n\n${arr[i] ?? ""}`.trim();
    arr.splice(i, 1);
    setCol(col, arr);
  }

  // Insert an empty cell at i (shifts this column down to realign).
  function insertAt(col: Column, i: number) {
    const arr = [...colArray(col)];
    arr.splice(i, 0, "");
    setCol(col, arr);
  }

  // Delete cell at i (shifts this column up).
  function deleteAt(col: Column, i: number) {
    const arr = [...colArray(col)];
    arr.splice(i, 1);
    setCol(col, arr);
  }

  function Cell({ col, i }: { col: Column; i: number }) {
    const arr = colArray(col);
    const value = arr[i] ?? null;
    const missing = value === null;
    return (
      <td className="group/cell w-1/2 align-top p-1">
        <div
          className={cn(
            "overflow-hidden rounded-lg border transition-colors focus-within:border-primary/50",
            missing
              ? "border-destructive/50 bg-destructive/5"
              : "border-border/70"
          )}
        >
          <Textarea
            value={value ?? ""}
            onChange={(e) => editCell(col, i, e.target.value)}
            rows={3}
            placeholder={missing ? "(missing — type or insert)" : ""}
            className="resize-y border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0 max-h-48"
          />
          <div className="flex items-center gap-0.5 border-t bg-muted/30 px-1 py-0.5 opacity-0 transition-opacity group-hover/cell:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              title="Merge into row above"
              disabled={i === 0}
              onClick={() => mergeUp(col, i)}
            >
              <ArrowUpToLine className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              title="Insert empty cell here (shift down)"
              onClick={() => insertAt(col, i)}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              title="Delete this cell (shift up)"
              onClick={() => deleteAt(col, i)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full table-fixed border-collapse">
        <thead className="sticky top-0 z-10 bg-muted/90 text-xs font-medium text-muted-foreground backdrop-blur">
          <tr>
            <th className="w-10 px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Question</th>
            <th className="px-3 py-2 text-left font-medium">Answer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dup = duplicates?.get(row.index);
            return (
              <tr
                key={row.index}
                className={cn("border-t", dup && "bg-amber-500/5")}
              >
                <td className="p-2 align-top text-xs tabular-nums text-muted-foreground">
                  <div className="flex flex-col items-center gap-1">
                    <span>{row.index + 1}</span>
                    {dup && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-amber-600 dark:text-amber-400">
                            <CopyCheck className="size-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="font-medium">Possible duplicate</p>
                          <p className="text-muted-foreground">
                            Matches {dup.matches.length} existing question
                            {dup.matches.length === 1 ? "" : "s"}:
                          </p>
                          <ul className="mt-1 list-disc pl-4">
                            {dup.matches.slice(0, 3).map((m) => (
                              <li key={m._id} className="truncate">
                                {m.title || "(untitled)"}
                              </li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>
                <Cell col="q" i={row.index} />
                <Cell col="a" i={row.index} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
