"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  ClipboardPaste,
  Check,
  CopyCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FolderPicker } from "@/components/folders/FolderPicker";
import { TagsInput } from "@/components/questions/TagsInput";
import { QuillEditor } from "./QuillEditor";
import { PreviewTable } from "./PreviewTable";
import { countMismatch } from "@/lib/paste/zip";
import { quillHtmlToMarkdown, isQuillEmpty } from "@/lib/paste/quillToMarkdown";
import { cn } from "@/lib/utils";
import { questionsApi } from "@/lib/api-client";
import type { DuplicateMatch, FolderTreeNode, QuestionStatus, UserRecord } from "@/types";

type Step = "input" | "preview";

export function PasteMapDialog({
  open,
  onOpenChange,
  tree,
  defaultFolderId,
  user,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tree: FolderTreeNode[];
  defaultFolderId: string | null;
  user: UserRecord | null;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>("input");

  // Rich-text content from the Quill editors.
  const [qText, setQText] = useState("");
  const [aText, setAText] = useState("");

  // Reconciled arrays in the preview (editable, may diverge from a re-split).
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);

  const [folderId, setFolderId] = useState<string | null>(defaultFolderId);

  // Keep the internal folder selection in sync with whichever folder is open
  // in the workspace. This fires when the dialog opens AND when the user
  // switches folders while the dialog was already mounted.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync with parent prop
    if (open) setFolderId(defaultFolderId);
  }, [open, defaultFolderId]);
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<QuestionStatus>("not_studied");
  const [allowUnmatched, setAllowUnmatched] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * For editor users, restrict the folder picker to only folders they created.
   * Admins and viewers see the full tree (viewers can't reach this dialog anyway).
   */
  const filteredTree = useMemo(() => {
    if (!user || user.role !== "editor") return tree;
    const filterNodes = (nodes: FolderTreeNode[]): FolderTreeNode[] =>
      nodes
        .filter((n) => n.createdBy?.id === user.id)
        .map((n) => ({ ...n, children: filterNodes(n.children) }));
    return filterNodes(tree);
  }, [tree, user]);

  // Duplicate detection: maps a row index -> matching existing questions.
  const [duplicates, setDuplicates] = useState<Map<number, DuplicateMatch>>(
    new Map(),
  );
  const [checkingDupes, setCheckingDupes] = useState(false);

  const mismatch = useMemo(
    () => countMismatch(questions, answers),
    [questions, answers],
  );

  // Re-check duplicates whenever the previewed questions or target folder
  // change (debounced). Scoped globally (no folderId) so cross-folder repeats
  // are surfaced too.
  useEffect(() => {
    if (step !== "preview" || questions.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing advisory duplicate state
      setDuplicates(new Map());
      return;
    }
    let cancelled = false;
    setCheckingDupes(true);
    const t = setTimeout(async () => {
      try {
        const { duplicates: dupes } =
          await questionsApi.checkDuplicates(questions);
        if (cancelled) return;
        setDuplicates(new Map(dupes.map((d) => [d.index, d])));
      } catch {
        // Non-fatal — duplicate detection is advisory.
      } finally {
        if (!cancelled) setCheckingDupes(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, questions]);

  const duplicateCount = duplicates.size;

  function reset() {
    setStep("input");
    setQText("");
    setAText("");
    setQuestions([]);
    setAnswers([]);
    // Restore to the currently-open folder, not null.
    setFolderId(defaultFolderId);
    setTags([]);
    setStatus("not_studied");
    setAllowUnmatched(false);
    setSaving(false);
    setDuplicates(new Map());
  }

  function goToPreview() {
    // Convert Quill HTML → Markdown so the full render pipeline works.
    const qMd = isQuillEmpty(qText) ? "" : quillHtmlToMarkdown(qText);
    const aMd = isQuillEmpty(aText) ? "" : quillHtmlToMarkdown(aText);
    if (!qMd && !aMd) {
      toast.error("Nothing to preview — enter a question and answer first");
      return;
    }
    setQuestions(qMd ? [qMd] : []);
    setAnswers(aMd ? [aMd] : []);
    setStep("preview");
  }

  async function save() {
    if (!folderId) {
      toast.error("Choose a folder to save into");
      return;
    }
    const len = Math.max(questions.length, answers.length);
    const pairs = Array.from({ length: len }, (_, i) => ({
      question: questions[i] ?? "",
      answer: answers[i] ?? "",
    })).filter((p) => p.question.trim() || p.answer.trim());

    if (pairs.length === 0) {
      toast.error("No question/answer pairs to save");
      return;
    }
    if (pairs.some((p) => !p.question.trim()) && !allowUnmatched) {
      toast.error(
        "Some questions are empty. Enable “allow unmatched” to save anyway.",
      );
      return;
    }

    setSaving(true);
    try {
      const createdBy = user
        ? {
            id: user.id,
            name: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
          }
        : null;
      const res = await questionsApi.bulkCreate({
        folderId,
        pairs,
        tags,
        status,
        createdBy,
      });
      toast.success(`Saved ${res.insertedCount} question(s)`);
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent
        className="sm:max-w-7xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b px-6 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardPaste className="size-4 text-muted-foreground" />
            Paste &amp; Map
          </DialogTitle>
        </DialogHeader>

        <div className="-mx-4 no-scrollbar max-h-[70dvh] overflow-y-auto px-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2 border-b px-6 pb-3 text-xs">
            <StepChip active={step === "input"} done={step === "preview"} n={1}>
              Paste
            </StepChip>
            <div className="h-px w-6 bg-border" />
            <StepChip active={step === "preview"} done={false} n={2}>
              Review &amp; Save
            </StepChip>
          </div>

          {step === "input" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
              <div className="mb-3">
                <p className="text-lg font-medium">Source text</p>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <Label>Question</Label>
                  <QuillEditor
                    value={qText}
                    onChange={setQText}
                    placeholder="Type or paste the question here…"
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <Label>Answer</Label>
                  <QuillEditor
                    value={aText}
                    onChange={setAText}
                    placeholder="Type or paste the answer here…"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-[50vh] flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-3">
                {mismatch ? (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <span className="font-medium">
                      {questions.length} questions · {answers.length} answers
                    </span>
                    <span className="text-destructive/80">
                      — {Math.abs(questions.length - answers.length)} unmatched.
                      Fix rows below or enable “allow unmatched”.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <span className="font-medium">
                      {questions.length} pairs matched 1:1
                    </span>
                    <span className="opacity-80">— ready to save</span>
                  </div>
                )}

                {(duplicateCount > 0 || checkingDupes) && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    {checkingDupes ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Checking for duplicates…
                      </>
                    ) : (
                      <>
                        <CopyCheck className="size-4" />
                        <span className="font-medium">
                          {duplicateCount} possible duplicate
                          {duplicateCount === 1 ? "" : "s"}
                        </span>
                        <span className="opacity-80">
                          — already in your knowledge base (highlighted below).
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <PreviewTable
                questions={questions}
                answers={answers}
                duplicates={duplicates}
                onChange={(q, a) => {
                  setQuestions(q);
                  setAnswers(a);
                }}
              />
            </div>
          )}

          {step === "preview" && (
            <div className="grid shrink-0 grid-cols-1 gap-4 border-t px-6 py-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Save into folder
                </Label>
                <FolderPicker
                  tree={filteredTree}
                  value={folderId}
                  onChange={setFolderId}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Tags (applied to all)
                </Label>
                <TagsInput tags={tags} onChange={setTags} />
              </div>
              {/* <div className="flex items-end pb-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-lg">
                  <Checkbox
                    checked={allowUnmatched}
                    onCheckedChange={(c) => setAllowUnmatched(Boolean(c))}
                  />
                  Allow unmatched (save empty sides)
                </label>
              </div> */}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 px-6 sm:justify-between">
          {step === "input" ? (
            <>
              <span />
              <Button
                onClick={goToPreview}
                disabled={!qText.trim() && !aText.trim()}
              >
                Preview <ArrowRight className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("input")}>
                <ArrowLeft className="size-4" /> Back to edit
              </Button>
              <Button
                onClick={save}
                disabled={saving || (mismatch && !allowUnmatched)}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save {Math.max(questions.length, answers.length)} question(s)
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small numbered step indicator used in the dialog header. */
function StepChip({
  active,
  done,
  n,
  children,
}: {
  active: boolean;
  done: boolean;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : done
            ? "text-muted-foreground"
            : "text-muted-foreground/60",
      )}
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full text-[10px]",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3" /> : n}
      </span>
      {children}
    </span>
  );
}
