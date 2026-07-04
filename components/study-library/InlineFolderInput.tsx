"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { foldersApi } from "@/lib/api-client";

/**
 * Inline text input for creating or renaming a folder. Enter submits, Escape
 * cancels, blur cancels (unless submitting).
 */
export function InlineFolderInput({
  depth,
  parentId,
  initialValue = "",
  placeholder = "Folder name",
  mode = "create",
  folderId,
  createdBy,
  onSubmit,
  onCancel,
}: {
  depth: number;
  parentId?: string | null;
  initialValue?: string;
  placeholder?: string;
  mode?: "create" | "rename";
  folderId?: string;
  /** The authenticated user — stored as createdBy on the new folder document. */
  createdBy?: { id: string; name: string; email: string } | null;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const name = value.trim();
    if (!name) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await foldersApi.create(name, parentId ?? null, createdBy);
        toast.success("Folder created");
      } else if (folderId) {
        await foldersApi.rename(folderId, name);
        toast.success("Folder renamed");
      }
      onSubmit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingLeft: depth * 12 + 4 }} className="py-0.5">
      <Input
        autoFocus
        disabled={busy}
        value={value}
        placeholder={placeholder}
        className="h-7 text-sm"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!busy) submit();
        }}
      />
    </div>
  );
}
