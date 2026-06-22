"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderPicker } from "./FolderPicker";
import { foldersApi } from "@/lib/api-client";
import { findNode } from "@/lib/tree-utils";
import type { FolderTreeNode } from "@/types";

/** Collect the id of a folder and all of its descendants (invalid move targets). */
function selfAndDescendantIds(node: FolderTreeNode): string[] {
  const ids = [node._id];
  for (const c of node.children) ids.push(...selfAndDescendantIds(c));
  return ids;
}

export function MoveFolderDialog({
  tree,
  movingId,
  onClose,
  onMoved,
}: {
  tree: FolderTreeNode[];
  movingId: string | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const node = movingId ? findNode(tree, movingId) : null;
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!node) return null;

  const disabledIds = selfAndDescendantIds(node);

  async function move() {
    if (!node) return;
    setBusy(true);
    try {
      await foldersApi.move(node._id, target);
      toast.success("Folder moved");
      onMoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move");
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(movingId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move “{node.name}”</DialogTitle>
          <DialogDescription>
            Choose a new parent folder, or move it to the top level.
          </DialogDescription>
        </DialogHeader>
        <FolderPicker
          tree={tree}
          value={target}
          onChange={setTarget}
          includeRoot
          disabledIds={disabledIds}
          placeholder="Select destination"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={move} disabled={busy}>
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
