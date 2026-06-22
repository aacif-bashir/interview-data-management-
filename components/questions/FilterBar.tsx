"use client";

import { useEffect, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { STATUS_LABELS, type QuestionListFilters } from "@/types";

const ANY = "__any__";

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Omit<QuestionListFilters, "folderId" | "cursor">;
  onChange: (f: Omit<QuestionListFilters, "folderId" | "cursor">) => void;
}) {
  // Local search input, debounced into the filters.
  const [q, setQ] = useState(filters.q ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q) onChange({ ...filters, q: q || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasActiveFilters =
    Boolean(filters.q) ||
    Boolean(filters.status) ||
    filters.favorite === true ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo);

  return (
    <div className="flex flex-col gap-2.5 border-b px-4 py-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search questions…"
          className="h-9 rounded-lg bg-muted/50 pl-8 shadow-none focus-visible:bg-background"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={filters.status ?? ANY}
          onValueChange={(v) =>
            onChange({
              ...filters,
              status:
                v === ANY ? undefined : (v as QuestionListFilters["status"]),
            })
          }
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ANY}>Any status</SelectItem>
            {(["not_studied", "learning", "mastered"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Toggle
          size="sm"
          pressed={filters.favorite === true}
          onPressedChange={(p) =>
            onChange({ ...filters, favorite: p ? true : undefined })
          }
          aria-label="Favorites only"
          className="gap-1.5"
        >
          <Star
            className={
              filters.favorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"
            }
          />
          Favorites
        </Toggle>

        <Input
          type="date"
          value={filters.dateFrom?.slice(0, 10) ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              dateFrom: e.target.value
                ? new Date(e.target.value).toISOString()
                : undefined,
            })
          }
          className="h-8 w-36"
          title="From date"
        />
        <Input
          type="date"
          value={filters.dateTo?.slice(0, 10) ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              dateTo: e.target.value
                ? new Date(e.target.value + "T23:59:59").toISOString()
                : undefined,
            })
          }
          className="h-8 w-36"
          title="To date"
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              onChange({ subtree: filters.subtree });
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
