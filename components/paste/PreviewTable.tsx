"use client";

import { useEffect, useState } from "react";
import { CopyCheck, Loader2 } from "lucide-react";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { zipRows } from "@/lib/paste/zip";
import { renderApi } from "@/lib/api-client";
import type { DuplicateMatch } from "@/types";

/**
 * Read-only Q | A preview table.
 * Each cell renders the stored Markdown string via the shared server-side
 * render pipeline (shiki syntax-highlighting), matching exactly what the
 * user will see in StudyPanel and QuestionListPanel.
 */
export function PreviewTable({
  questions,
  answers,
  duplicates,
  // Keep onChange in the signature for compatibility but the table is now read-only.
  onChange,
}: {
  questions: string[];
  answers: string[];
  onChange: (questions: string[], answers: string[]) => void;
  /** Row index -> matching existing questions (advisory duplicate flag). */
  duplicates?: Map<number, DuplicateMatch>;
}) {
  const rows = zipRows(questions, answers);

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
                <RenderedCell markdown={questions[row.index] ?? null} />
                <RenderedCell markdown={answers[row.index] ?? null} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Renders a single Markdown string as styled HTML via the render API. */
function RenderedCell({ markdown }: { markdown: string | null }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const missing = markdown === null;

  useEffect(() => {
    if (!markdown?.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing preview
      setHtml("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    renderApi
      .many([markdown])
      .then(({ html: rendered }) => {
        if (!cancelled) setHtml(rendered[0] ?? "");
      })
      .catch(() => {
        /* leave last render on failure */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markdown]);

  return (
    <td className="w-1/2 align-top p-2">
      <div
        className={cn(
          "min-h-[3rem] overflow-auto rounded-lg border px-3 py-2 text-sm",
          missing
            ? "border-destructive/50 bg-destructive/5 text-muted-foreground italic"
            : "border-border/70 bg-background",
        )}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : missing ? (
          <span className="text-xs">(missing)</span>
        ) : html ? (
          <MarkdownHtml html={html} />
        ) : (
          <span className="text-xs italic text-muted-foreground">(empty)</span>
        )}
      </div>
    </td>
  );
}
