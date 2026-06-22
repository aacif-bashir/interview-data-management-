"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { questionsApi } from "@/lib/api-client";
import { findNode, flattenTree } from "@/lib/tree-utils";
import { StatusBadge } from "./StatusBadge";
import { FilterBar } from "./FilterBar";
import {
  STATUS_LABELS,
  type FolderTreeNode,
  type QuestionListFilters,
  type QuestionListItem,
  type QuestionStatus,
} from "@/types";
import { Star, StarOff, Trash2, FolderInput } from "lucide-react";

export function QuestionListPanel({
  filters,
  tree,
  selectedQuestionId,
  onSelectQuestion,
  onFiltersChange,
  currentFilters,
  onItemsLoaded,
  onMutated,
}: {
  filters: QuestionListFilters;
  tree: FolderTreeNode[];
  selectedQuestionId: string | null;
  onSelectQuestion: (q: QuestionListItem) => void;
  onFiltersChange: (
    f: Omit<QuestionListFilters, "folderId" | "cursor">
  ) => void;
  currentFilters: Omit<QuestionListFilters, "folderId" | "cursor">;
  /** Reports the currently-loaded list up so the study panel can navigate. */
  onItemsLoaded?: (items: QuestionListItem[]) => void;
  /** Called after a row mutation (delete/status/favorite) to refresh counts. */
  onMutated?: (deletedId?: string) => void;
}) {
  const [items, setItems] = useState<QuestionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const folder = filters.folderId ? findNode(tree, filters.folderId) : null;
  const flatFolders = flattenTree(tree);

  const load = useCallback(
    async (cursor?: string) => {
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await questionsApi.list({ ...filters, cursor });
        setNextCursor(res.nextCursor);
        // Compute the next list, then report it up — never call a parent
        // setState from inside the setItems updater (must stay pure).
        setItems((prev) => (cursor ? [...prev, ...res.items] : res.items));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  // Fetch the list from the API whenever the filters/folder change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing with the questions API
    load();
  }, [load]);

  // Report the loaded items up so the study panel can navigate between them.
  // Done in an effect (after render) rather than inside setItems to keep the
  // state updater pure and avoid cascading-render warnings.
  useEffect(() => {
    onItemsLoaded?.(items);
  }, [items, onItemsLoaded]);

  // --- Row actions (context menu) ---

  const changeStatus = useCallback(
    async (q: QuestionListItem, status: QuestionStatus) => {
      if (q.status === status) return;
      setItems((prev) =>
        prev.map((it) => (it._id === q._id ? { ...it, status } : it))
      );
      try {
        await questionsApi.setStatus(q._id, status);
        onMutated?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update status");
        load(); // revert by reloading
      }
    },
    [load, onMutated]
  );

  const toggleFavorite = useCallback(
    async (q: QuestionListItem) => {
      const favorite = !q.favorite;
      setItems((prev) =>
        prev.map((it) => (it._id === q._id ? { ...it, favorite } : it))
      );
      try {
        await questionsApi.setFavorite(q._id, favorite);
        onMutated?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
        load();
      }
    },
    [load, onMutated]
  );

  const moveQuestion = useCallback(
    async (q: QuestionListItem, destFolderId: string) => {
      if (q.folderId === destFolderId) return;
      const destName = findNode(tree, destFolderId)?.name ?? "folder";
      // Optimistically drop the row — it no longer belongs to this view when
      // a single folder is in scope. The reload via onMutated reconciles the
      // exact set (e.g. when "All questions" or subfolders are shown).
      setItems((prev) => prev.filter((it) => it._id !== q._id));
      try {
        await questionsApi.update(q._id, { folderId: destFolderId });
        toast.success(`Moved to “${destName}”`);
        onMutated?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to move");
        load();
      }
    },
    [load, onMutated, tree]
  );

  const deleteQuestion = useCallback(
    async (q: QuestionListItem) => {
      if (
        !window.confirm(
          `Delete this question?\n\n“${q.title || "(untitled)"}”\n\nThis cannot be undone.`
        )
      )
        return;
      setItems((prev) => prev.filter((it) => it._id !== q._id));
      try {
        await questionsApi.remove(q._id);
        toast.success("Question deleted");
        onMutated?.(q._id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete");
        load();
      }
    },
    [load, onMutated]
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-semibold tracking-tight">
            {folder ? folder.name : "All questions"}
          </span>
          {items.length > 0 && (
            <span className="shrink-0 text-sm font-normal text-muted-foreground">
              {items.length}
              {nextCursor ? "+" : ""}
            </span>
          )}
        </h2>
        {folder && (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <Checkbox
              checked={currentFilters.subtree ?? false}
              onCheckedChange={(c) =>
                onFiltersChange({ ...currentFilters, subtree: Boolean(c) })
              }
            />
            Subfolders
          </label>
        )}
      </div>

      <FilterBar filters={currentFilters} onChange={onFiltersChange} />

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-20 text-center text-sm text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-6" />
            </div>
            <p className="font-medium text-foreground">No questions yet</p>
            <p className="text-sm">
              Use “Paste &amp; Map” to add questions to a folder.
            </p>
          </div>
        ) : (
          <ul className="px-2 py-1.5">
            {items.map((q, i) => {
              const active = selectedQuestionId === q._id;
              return (
                <li key={q._id}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelectQuestion(q)}
                        className={cn(
                          "group relative flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          active ? "bg-accent" : "hover:bg-accent/50"
                        )}
                      >
                        {active && (
                          <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
                        )}
                        <span className="mt-0.5 w-5 shrink-0 text-sm tabular-nums text-muted-foreground/70">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-medium leading-snug">
                            {q.title || "(untitled)"}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <StatusBadge
                              status={q.status}
                              className="text-[10px]"
                            />
                            {q.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                #{t}
                              </span>
                            ))}
                          </span>
                        </span>
                        {q.favorite && (
                          <Star className="mt-0.5 size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                        )}
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextMenuItem onClick={() => toggleFavorite(q)}>
                        {q.favorite ? (
                          <>
                            <StarOff className="size-4" /> Remove favorite
                          </>
                        ) : (
                          <>
                            <Star className="size-4" /> Add favorite
                          </>
                        )}
                      </ContextMenuItem>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <StatusBadge
                            status={q.status}
                            className="text-[10px]"
                          />
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          <ContextMenuRadioGroup value={q.status}>
                            {(
                              [
                                "not_studied",
                                "learning",
                                "mastered",
                              ] as const
                            ).map((s) => (
                              <ContextMenuRadioItem
                                key={s}
                                value={s}
                                onClick={() => changeStatus(q, s)}
                              >
                                {STATUS_LABELS[s]}
                              </ContextMenuRadioItem>
                            ))}
                          </ContextMenuRadioGroup>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <FolderInput className="size-4" /> Move to folder
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="max-h-72 overflow-y-auto">
                          {flatFolders.map((f) => (
                            <ContextMenuItem
                              key={f._id}
                              disabled={f._id === q.folderId}
                              onClick={() => moveQuestion(q, f._id)}
                            >
                              <span style={{ paddingLeft: f.depth * 12 }}>
                                {f.name}
                              </span>
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => deleteQuestion(q)}
                      >
                        <Trash2 className="size-4" /> Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </li>
              );
            })}
          </ul>
        )}

        {nextCursor && !loading && (
          <div className="px-3 pb-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={loadingMore}
              onClick={() => load(nextCursor)}
            >
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Load more
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
