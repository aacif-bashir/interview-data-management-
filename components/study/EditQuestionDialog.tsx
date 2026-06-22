"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MarkdownTextarea } from "@/components/paste/MarkdownTextarea";
import { TagsInput } from "@/components/questions/TagsInput";
import { FolderPicker } from "@/components/folders/FolderPicker";
import { questionsApi } from "@/lib/api-client";
import type { FolderTreeNode, QuestionDTO } from "@/types";

export function EditQuestionDialog({
  open,
  onOpenChange,
  tree,
  question,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tree: FolderTreeNode[];
  question: QuestionDTO;
  onSaved: (updated: QuestionDTO) => void;
}) {
  const [q, setQ] = useState(question.question);
  const [a, setA] = useState(question.answer);
  const [tags, setTags] = useState<string[]>(question.tags);
  const [folderId, setFolderId] = useState<string | null>(question.folderId);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!q.trim()) {
      toast.error("Question cannot be empty");
      return;
    }
    setBusy(true);
    try {
      const updated = await questionsApi.update(question._id, {
        question: q,
        answer: a,
        tags,
        folderId: folderId ?? question.folderId,
      });
      toast.success("Saved");
      onSaved(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      setBusy(false);
    }
    finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="border-b pb-3">
          <DialogTitle>Edit question</DialogTitle>
        </DialogHeader>
        <div className="-mx-4 no-scrollbar max-h-[60vh] overflow-y-auto px-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Question (Markdown)</Label>
            <MarkdownTextarea
              value={q}
              onChange={setQ}
              editorClassName="min-h-[8rem] max-h-[40vh]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Answer (Markdown)</Label>
            <MarkdownTextarea
              value={a}
              onChange={setA}
              editorClassName="min-h-[12rem] max-h-[40vh]"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Folder</Label>
              <FolderPicker tree={tree} value={folderId} onChange={setFolderId} />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagsInput tags={tags} onChange={setTags} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
