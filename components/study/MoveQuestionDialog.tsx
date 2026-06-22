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
import { Label } from "@/components/ui/label";
import { FolderPicker } from "@/components/folders/FolderPicker";
import { questionsApi } from "@/lib/api-client";
import { findNode } from "@/lib/tree-utils";
import type { FolderTreeNode, QuestionDTO } from "@/types";

/** Lightweight dialog to move a single question to a different folder. */
export function MoveQuestionDialog({
  open,
  onOpenChange,
  tree,
  question,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tree: FolderTreeNode[];
  question: QuestionDTO;
  onMoved: (updated: QuestionDTO) => void;
}) {
  const [folderId, setFolderId] = useState<string | null>(question.folderId);
  const [busy, setBusy] = useState(false);

  const currentName = findNode(tree, question.folderId)?.name ?? "this folder";
  const unchanged = !folderId || folderId === question.folderId;

  async function move() {
    if (unchanged) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const updated = await questionsApi.update(question._id, {
        folderId: folderId!,
      });
      toast.success("Question moved");
      onMoved(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move question</DialogTitle>
          <DialogDescription>
            Currently in <span className="font-medium">{currentName}</span>.
            Choose a destination folder.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Destination folder</Label>
          <FolderPicker
            tree={tree}
            value={folderId}
            onChange={setFolderId}
            disabledIds={[question.folderId]}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={move} disabled={busy || unchanged}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
