"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Simple tag editor: type and press Enter/comma to add; click × to remove. */
export function TagsInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [value, setValue] = useState("");

  function add() {
    const t = value.trim().toLowerCase().replace(/,$/, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setValue("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-2">
      {tags.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 rounded bg-muted px-2 py-2 text-xs"
        >
          #{t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`Remove ${t}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !value && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={tags.length ? "" : "Add tags…"}
        className="h-6 flex-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
