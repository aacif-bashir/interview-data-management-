"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Code, SquareCode, Loader2, Eye, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { renderApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Mode = "write" | "preview";

/**
 * A markdown-aware editor: a plain `<Textarea>` whose value stays a markdown
 * string (so it flows unchanged through the split/save pipeline), augmented
 * with a formatting toolbar — including fenced code blocks — and a live
 * Preview tab that renders via the shared server-side render pipeline (shiki
 * syntax highlighting), matching how questions/answers look at study time.
 */
export function MarkdownTextarea({
  value,
  onChange,
  placeholder,
  className,
  editorClassName = "min-h-[35vh] max-h-[40vh]",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  /** Height/size classes applied to both the textarea and preview pane. */
  editorClassName?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>("write");

  // Language for the next code-block insertion (remembered between inserts).
  const [lang, setLang] = useState("ts");

  /**
   * Wrap the current selection (or insert at the cursor) with `before`/`after`.
   * `block` inserts the markers on their own lines (used for code fences).
   */
  const wrapSelection = useCallback(
    (before: string, after: string, block = false) => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end);
      const placeholder = block ? "code" : "text";
      const body = selected || placeholder;

      let insert: string;
      if (block) {
        // Ensure the fence sits on its own lines, with a blank line before it
        // when there's preceding content on the same line.
        const needsLeadingNl =
          start > 0 && value[start - 1] !== "\n" ? "\n" : "";
        insert = `${needsLeadingNl}${before}\n${body}\n${after}`;
      } else {
        insert = `${before}${body}${after}`;
      }

      const next = value.slice(0, start) + insert + value.slice(end);
      onChange(next);

      // Restore a sensible selection/caret after React re-renders.
      const selFrom = start + insert.indexOf(body);
      const selTo = selFrom + body.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(selFrom, selTo);
      });
    },
    [value, onChange],
  );

  const insertCodeBlock = useCallback(() => {
    const fence = "```";
    wrapSelection(`${fence}${lang.trim()}`, fence, true);
  }, [wrapSelection, lang]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        {/* Write / Preview switch */}
        <div className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          <ModeButton
            active={mode === "write"}
            onClick={() => setMode("write")}
            icon={<Pencil className="size-3.5" />}
          >
            Write
          </ModeButton>
          <ModeButton
            active={mode === "preview"}
            onClick={() => setMode("preview")}
            icon={<Eye className="size-3.5" />}
          >
            Preview
          </ModeButton>
        </div>

        {/* Formatting toolbar — only meaningful while writing. */}
        {mode === "write" && (
          <TooltipProvider>
            <div className="flex items-center gap-1">
              <Input
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                placeholder="lang"
                aria-label="Code block language"
                className="h-7 w-20 text-xs"
              />
              <ToolbarButton
                label="Code block (```)"
                onClick={insertCodeBlock}
              >
                <SquareCode className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Inline code (`)"
                onClick={() => wrapSelection("`", "`")}
              >
                <Code className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Bold (**)"
                onClick={() => wrapSelection("**", "**")}
              >
                <Bold className="size-4" />
              </ToolbarButton>
            </div>
          </TooltipProvider>
        )}
      </div>

      {mode === "write" ? (
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "resize-none font-mono text-lg",
            editorClassName,
          )}
        />
      ) : (
        <MarkdownPreview source={value} className={editorClassName} />
      )}
    </div>
  );
}

/** Live preview pane: renders markdown via the shared server pipeline. */
function MarkdownPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!source.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing preview when source is empty
      setHtml("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { html: rendered } = await renderApi.many([source]);
        if (!cancelled) setHtml(rendered[0] ?? "");
      } catch {
        // Preview is advisory; leave the last render on transient failure.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [source]);

  return (
    <div
      className={cn(
        "relative overflow-y-auto rounded-md border bg-background px-4 py-3",
        className,
      )}
    >
      {loading && (
        <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-muted-foreground" />
      )}
      <MarkdownHtml html={html} />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
