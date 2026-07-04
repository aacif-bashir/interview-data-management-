"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { flattenTree } from "@/lib/tree-utils";
import type { FolderTreeNode } from "@/types";

const ROOT_VALUE = "__root__";

/** A select that lists every folder indented by depth. */
export function FolderPicker({
  tree,
  value,
  onChange,
  includeRoot = false,
  disabledIds = [],
  placeholder = "Select a folder",
}: {
  tree: FolderTreeNode[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Allow choosing "no parent" (root level). */
  includeRoot?: boolean;
  disabledIds?: string[];
  placeholder?: string;
}) {
  const flat = flattenTree(tree);

  return (
    <Select
      value={value ?? (includeRoot ? ROOT_VALUE : undefined)}
      onValueChange={(v) => onChange(v === ROOT_VALUE ? null : v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {includeRoot && (
          <SelectItem value={ROOT_VALUE}>（Top level）</SelectItem>
        )}
        {flat.map((f) => (
          <SelectItem
            key={f._id}
            value={f._id}
            disabled={disabledIds.includes(f._id)}
          >
            <span style={{ paddingLeft: f.depth * 12 }}>{f.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
