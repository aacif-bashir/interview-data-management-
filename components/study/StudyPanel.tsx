"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Star,
  Trash2,
  Pencil,
  Loader2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderInput,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import { AnswerReveal } from "./AnswerReveal";
import { EditQuestionDialog } from "./EditQuestionDialog";
import { MoveQuestionDialog } from "./MoveQuestionDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { questionsApi, renderApi } from "@/lib/api-client";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import { usePersistentBoolean } from "@/hooks/usePersistentBoolean";
import {
  STATUS_LABELS,
  type FolderTreeNode,
  type QuestionDTO,
  type QuestionListItem,
  type QuestionStatus,
} from "@/types";
import type { UserRecord } from "@/types/user";

interface StudyNavProps {
  /** 0-based index + total of the current question within the loaded list. */
  position: { index: number; total: number } | null;
  onPrev: () => void;
  onNext: () => void;
}

export function StudyPanel({
  tree,
  selected,
  position,
  onPrev,
  onNext,
  onChanged,
  onDeleted,
  canEdit = false,
  user,
}: {
  tree: FolderTreeNode[];
  selected: QuestionListItem | null;
  onChanged: () => void;
  onDeleted: () => void;
  canEdit?: boolean;
  /** Current authenticated user — used for editor-scoped ownership checks. */
  user?: UserRecord | null;
} & StudyNavProps) {
  // Persisted preference: reveal answers automatically when opening a question.
  // Defaults to true (answers shown), remembered across sessions.
  const [revealByDefault, setRevealByDefault] = usePersistentBoolean(
    "study:revealByDefault",
    true
  );

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-muted-foreground">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <BookOpen className="size-7" />
        </div>
        <p className="font-medium text-foreground">Select a question to study</p>
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <kbd className="rounded border bg-muted px-1.5 py-0.5">Space</kbd>
          reveal
          <span className="opacity-40">·</span>
          <kbd className="rounded border bg-muted px-1.5 py-0.5">←</kbd>
          <kbd className="rounded border bg-muted px-1.5 py-0.5">→</kbd>
          navigate
        </p>
      </div>
    );
  }

  /**
   * Compute whether the current user can edit this specific question.
   * - admin: yes (canEdit is true)
   * - editor: only if the question's folder was created by this user
   * - viewer: no
   */
  const folderNode = tree.find((n) => n._id === selected.folderId) ??
    // Also search nested via a quick flatten helper
    (() => {
      const flatten = (nodes: FolderTreeNode[]): FolderTreeNode | undefined => {
        for (const n of nodes) {
          if (n._id === selected.folderId) return n;
          const found = flatten(n.children);
          if (found) return found;
        }
      };
      return flatten(tree);
    })();

  const canEditQuestion =
    canEdit &&
    (user?.role === "admin" ||
      (user?.role === "editor" &&
        folderNode?.createdBy != null &&
        folderNode.createdBy.id === user.id));

  // Keyed by id so switching questions remounts with fresh state — no reset
  // effect needed.
  return (
    <QuestionStudy
      key={selected._id}
      tree={tree}
      questionId={selected._id}
      position={position}
      onPrev={onPrev}
      onNext={onNext}
      onChanged={onChanged}
      onDeleted={onDeleted}
      revealByDefault={revealByDefault}
      onRevealByDefaultChange={setRevealByDefault}
      canEdit={canEditQuestion}
    />
  );
}

function QuestionStudy({
  tree,
  questionId,
  position,
  onPrev,
  onNext,
  onChanged,
  onDeleted,
  revealByDefault,
  onRevealByDefaultChange,
  canEdit = false,
}: {
  tree: FolderTreeNode[];
  questionId: string;
  onChanged: () => void;
  onDeleted: () => void;
  revealByDefault: boolean;
  onRevealByDefaultChange: (value: boolean) => void;
  canEdit?: boolean;
} & StudyNavProps) {
  const [detail, setDetail] = useState<QuestionDTO | null>(null);
  const [questionHtml, setQuestionHtml] = useState("");
  const [answerHtml, setAnswerHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(revealByDefault);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const q = await questionsApi.get(id);
      const { html } = await renderApi.many([q.question, q.answer]);
      setDetail(q);
      setQuestionHtml(html[0] ?? "");
      setAnswerHtml(html[1] ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load question");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the selected question's detail on mount (async fetch — state updates
  // happen after an await, not synchronously).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch from the questions API
    loadDetail(questionId);
  }, [questionId, loadDetail]);

  const canPrev = position !== null && position.index > 0;
  const canNext = position !== null && position.index < position.total - 1;

  useKeyboardNav({
    enabled: Boolean(detail),
    onToggleAnswer: () => setRevealed((v) => !v),
    onPrev: canPrev ? onPrev : undefined,
    onNext: canNext ? onNext : undefined,
  });

  async function updateStatus(status: QuestionStatus) {
    if (!detail) return;
    try {
      await questionsApi.setStatus(detail._id, status);
      setDetail({ ...detail, status });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function toggleFavorite() {
    if (!detail) return;
    const next = !detail.favorite;
    try {
      await questionsApi.setFavorite(detail._id, next);
      setDetail({ ...detail, favorite: next });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove() {
    if (!detail) return;
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    try {
      await questionsApi.remove(detail._id);
      toast.success("Question deleted");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Select
            value={detail?.status ?? "not_studied"}
            onValueChange={(v) => updateStatus(v as QuestionStatus)}
            disabled={!detail || !canEdit}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {(["not_studied", "learning", "mastered"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFavorite}
            disabled={!detail || !canEdit}
            aria-label="Toggle favorite"
          >
            <Star
              className={
                detail?.favorite
                  ? "size-4 fill-amber-400 text-amber-400"
                  : "size-4"
              }
            />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Label
            htmlFor="reveal-by-default"
            className="mr-1 flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground"
          >
            <Checkbox
              id="reveal-by-default"
              checked={revealByDefault}
              onCheckedChange={(c) => {
                const next = c === true;
                onRevealByDefaultChange(next);
                // Reflect the new default on the current question immediately.
                setRevealed(next);
              }}
            />
            Reveal all
          </Label>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMoving(true)}
                disabled={!detail}
                aria-label="Move to folder"
              >
                <FolderInput className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(true)}
                disabled={!detail}
                aria-label="Edit"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={remove}
                disabled={!detail}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {position && (
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrev}
            disabled={!canPrev}
            className="text-muted-foreground"
          >
            <ChevronLeft className="size-4" /> Prev
          </Button>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {position.index + 1} <span className="opacity-50">/</span>{" "}
            {position.total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNext}
            disabled={!canNext}
            className="text-muted-foreground"
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        {loading || !detail ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-8">
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Question
              </p>
              <div className="text-[15px]">
                <MarkdownHtml html={questionHtml} />
              </div>
            </div>

            {detail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <Separator />

            <AnswerReveal
              answerHtml={answerHtml}
              revealed={revealed}
              onToggle={() => setRevealed((v) => !v)}
            />
          </div>
        )}
      </ScrollArea>

      {detail && (
        <>
          <EditQuestionDialog
            key={detail._id}
            open={editing}
            onOpenChange={setEditing}
            tree={tree}
            question={detail}
            onSaved={(updated) => {
              setEditing(false);
              setDetail(updated);
              loadDetail(updated._id);
              onChanged();
            }}
          />
          <MoveQuestionDialog
            key={`move-${detail._id}`}
            open={moving}
            onOpenChange={setMoving}
            tree={tree}
            question={detail}
            onMoved={(updated) => {
              setMoving(false);
              setDetail(updated);
              onChanged();
            }}
          />
        </>
      )}
    </div>
  );
}
