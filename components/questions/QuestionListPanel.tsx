"use client";

import { useCallback, useEffect, useRef } from "react";
import { useState } from "react";
import { Loader2, Inbox, GripVertical, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { UserRecord } from "@/types/user";
import { Star, StarOff, Trash2, FolderInput } from "lucide-react";

// ─── dnd-kit ──────────────────────────────────────────────────────────────────
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Sortable row ─────────────────────────────────────────────────────────────
//
// • {attributes} + {listeners} on the <li> → full-row drag surface.
// • 3-dot MoreVertical button appears on hover → DropdownMenu with actions.
// • PointerSensor distance:6 keeps plain clicks working.

function SortableQuestionRow({
  q,
  index,
  active,
  canEditQ,
  isDndActive,
  onSelectQuestion,
  toggleFavorite,
  changeStatus,
  moveQuestion,
  deleteQuestion,
  flatFolders,
  isDragDisabled,
}: {
  q: QuestionListItem;
  index: number;
  active: boolean;
  canEditQ: boolean;
  isDndActive: boolean;
  onSelectQuestion: (q: QuestionListItem) => void;
  toggleFavorite: (q: QuestionListItem) => void;
  changeStatus: (q: QuestionListItem, s: QuestionStatus) => void;
  moveQuestion: (q: QuestionListItem, destId: string) => void;
  deleteQuestion: (q: QuestionListItem) => void;
  flatFolders: { _id: string; name: string; depth: number }[];
  isDragDisabled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: q._id, disabled: isDragDisabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: isDragDisabled ? undefined : isDragging ? "grabbing" : "grab",
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group/row relative"
      {...(isDragDisabled ? {} : { ...attributes, ...listeners })}
    >
      {/* Main row button */}
      <button
        type="button"
        onClick={() => onSelectQuestion(q)}
        className={cn(
          "relative flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
          isDragging && "ring-2 ring-primary/30 shadow-md",
        )}
      >
        {active && (
          <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
        )}

        {/* Grip icon — visual hint that the row is draggable */}
        {isDndActive && canEditQ && (
          <GripVertical
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground/20 transition-colors",
              "group-hover/row:text-muted-foreground/50",
            )}
          />
        )}

        {/* Serial number */}
        <span className="mt-0.5 w-5 shrink-0 text-sm tabular-nums text-muted-foreground/70">
          {index + 1}
        </span>

        {/* Title + badges */}
        <span className="min-w-0 flex-1 pr-7">
          <span className="line-clamp-2 text-sm font-medium leading-snug">
            {q.title || "(untitled)"}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={q.status} className="text-[10px]" />
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

      {/* ⋮ More-options button — floats over the right edge on hover/open */}
      {canEditQ && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              // Stop pointer events from bubbling to the <li> drag listeners
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              aria-label="More options"
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1",
                "text-muted-foreground/40 transition-all",
                "hover:bg-accent hover:text-foreground",
                // Always visible when menu is open; otherwise show on row-hover
                menuOpen
                  ? "opacity-100 text-foreground bg-accent"
                  : "opacity-0 group-hover/row:opacity-100",
              )}
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-48"
            // Prevent dropdown pointer events from bubbling to drag listeners
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Favorite toggle */}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(q);
              }}
            >
              {q.favorite ? (
                <>
                  <StarOff className="size-4" /> Remove favorite
                </>
              ) : (
                <>
                  <Star className="size-4" /> Add favorite
                </>
              )}
            </DropdownMenuItem>

            {/* Status submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                {/* <StatusBadge status={q.status} className="text-[10px]" /> */}
                <span className="ml-1.5">Set status</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={q.status}>
                  {(["not_studied", "learning", "mastered"] as const).map(
                    (s) => (
                      <DropdownMenuRadioItem
                        key={s}
                        value={s}
                        onClick={(e) => {
                          e.stopPropagation();
                          changeStatus(q, s);
                        }}
                      >
                        {STATUS_LABELS[s]}
                      </DropdownMenuRadioItem>
                    ),
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* Move to folder submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                <FolderInput className="size-4" /> Move to folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {flatFolders.map((f) => (
                  <DropdownMenuItem
                    key={f._id}
                    disabled={f._id === q.folderId}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveQuestion(q, f._id);
                    }}
                  >
                    <span style={{ paddingLeft: f.depth * 12 }}>{f.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Delete */}
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                deleteQuestion(q);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function QuestionListPanel({
  filters,
  tree,
  selectedQuestionId,
  onSelectQuestion,
  onFiltersChange,
  currentFilters,
  onItemsLoaded,
  onMutated,
  canEdit = false,
  user,
}: {
  filters: QuestionListFilters;
  tree: FolderTreeNode[];
  selectedQuestionId: string | null;
  onSelectQuestion: (q: QuestionListItem) => void;
  onFiltersChange: (
    f: Omit<QuestionListFilters, "folderId" | "cursor">,
  ) => void;
  currentFilters: Omit<QuestionListFilters, "folderId" | "cursor">;
  onItemsLoaded?: (items: QuestionListItem[]) => void;
  onMutated?: (deletedId?: string) => void;
  canEdit?: boolean;
  user?: UserRecord | null;
}) {
  const [items, setItems] = useState<QuestionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingDeleteQ, setPendingDeleteQ] = useState<QuestionListItem | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folder = filters.folderId ? findNode(tree, filters.folderId) : null;
  const flatFolders = flattenTree(tree);

  function canEditQuestion(q: QuestionListItem): boolean {
    if (!canEdit) return false;
    if (user?.role === "admin") return true;
    if (user?.role === "editor") {
      const folderNode = findNode(tree, q.folderId);
      return folderNode?.createdBy?.id === user.id;
    }
    return false;
  }

  const load = useCallback(
    async (cursor?: string) => {
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await questionsApi.list({ ...filters, cursor });
        setNextCursor(res.nextCursor);
        setItems((prev) => (cursor ? [...prev, ...res.items] : res.items));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing with the questions API
    load();
  }, [load]);

  useEffect(() => {
    onItemsLoaded?.(items);
  }, [items, onItemsLoaded]);

  // ─── DnD sensors (distance:6 keeps clicks working) ────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((q) => q._id === active.id);
      const newIndex = prev.findIndex((q) => q._id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);
      const baseOrder =
        reordered.reduce(
          (mn, it) => Math.min(mn, it.order ?? 1000),
          Infinity,
        ) || 1000;
      const withNewOrders = reordered.map((item, idx) => ({
        ...item,
        order: baseOrder + idx * 1000,
      }));

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await questionsApi.reorder(
            withNewOrders.map((it) => ({
              id: it._id,
              collectionName: it.collectionName,
              order: it.order,
            })),
          );
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to save order");
          load();
        }
      }, 400);

      return withNewOrders;
    });
  }

  const activeDragItem = activeDragId
    ? items.find((q) => q._id === activeDragId)
    : null;

  // ─── Row actions ──────────────────────────────────────────────────────────

  const changeStatus = useCallback(
    async (q: QuestionListItem, status: QuestionStatus) => {
      if (q.status === status) return;
      setItems((prev) =>
        prev.map((it) => (it._id === q._id ? { ...it, status } : it)),
      );
      try {
        await questionsApi.setStatus(q._id, status);
        onMutated?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update status");
        load();
      }
    },
    [load, onMutated],
  );

  const toggleFavorite = useCallback(
    async (q: QuestionListItem) => {
      const favorite = !q.favorite;
      setItems((prev) =>
        prev.map((it) => (it._id === q._id ? { ...it, favorite } : it)),
      );
      try {
        await questionsApi.setFavorite(q._id, favorite);
        onMutated?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
        load();
      }
    },
    [load, onMutated],
  );

  const moveQuestion = useCallback(
    async (q: QuestionListItem, destFolderId: string) => {
      if (q.folderId === destFolderId) return;
      const destName = findNode(tree, destFolderId)?.name ?? "folder";
      setItems((prev) => prev.filter((it) => it._id !== q._id));
      try {
        await questionsApi.update(q._id, { folderId: destFolderId });
        toast.success(`Moved to "${destName}"`);
        onMutated?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to move");
        load();
      }
    },
    [load, onMutated, tree],
  );

  const deleteQuestion = useCallback(
    async (q: QuestionListItem) => {
      // Open the confirm dialog instead of window.confirm
      setPendingDeleteQ(q);
    },
    [],
  );

  async function confirmDeleteQuestion(q: QuestionListItem) {
    setItems((prev) => prev.filter((it) => it._id !== q._id));
    try {
      await questionsApi.remove(q._id);
      toast.success("Question deleted");
      onMutated?.(q._id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
      load();
    }
  }

  const isDndEnabled = canEdit && Boolean(filters.folderId);

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

      {/*
       * Plain overflow-y-auto div — NOT Radix ScrollArea.
       * Radix wraps in overflow:hidden which swallows dnd-kit pointer events.
       */}
      <div className="flex-1 overflow-y-auto">
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
              Use &quot;Paste &amp; Map&quot; to add questions to a folder.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((q) => q._id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="px-2 py-1.5">
                {items.map((q, i) => (
                  <SortableQuestionRow
                    key={q._id}
                    q={q}
                    index={i}
                    active={selectedQuestionId === q._id}
                    canEditQ={canEditQuestion(q)}
                    isDndActive={isDndEnabled}
                    onSelectQuestion={onSelectQuestion}
                    toggleFavorite={toggleFavorite}
                    changeStatus={changeStatus}
                    moveQuestion={moveQuestion}
                    deleteQuestion={deleteQuestion}
                    flatFolders={flatFolders}
                    isDragDisabled={!isDndEnabled || !canEditQuestion(q)}
                  />
                ))}
              </ul>
            </SortableContext>

            {/* Ghost card while dragging */}
            <DragOverlay dropAnimation={null}>
              {activeDragItem ? (
                <div className="flex w-full items-start gap-2.5 rounded-lg border border-primary/30 bg-accent px-2.5 py-2 shadow-xl ring-2 ring-primary/20">
                  <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                  <span className="mt-0.5 w-5 shrink-0 text-sm tabular-nums text-muted-foreground/70">
                    {items.findIndex((it) => it._id === activeDragItem._id) + 1}
                  </span>
                  <span className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug">
                    {activeDragItem.title || "(untitled)"}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
      </div>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={Boolean(pendingDeleteQ)}
        onOpenChange={(open) => { if (!open) setPendingDeleteQ(null); }}
        title="Delete question?"
        description={pendingDeleteQ ? `"${pendingDeleteQ.title || "(untitled)"}" will be permanently removed. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteQ) {
            setPendingDeleteQ(null);
            confirmDeleteQuestion(pendingDeleteQ);
          }
        }}
      />
    </div>
  );
}
