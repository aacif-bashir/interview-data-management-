"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { MobileBottomNav, type StudyView } from "@/components/workspace/MobileBottomNav";
import { foldersApi, questionsApi } from "@/lib/api-client";
import type {
  FolderTreeNode,
  QuestionListFilters,
  QuestionListItem,
  UserRecord,
} from "@/types";
import { FolderSidebar } from "@/components/study-library/FolderSidebar";
import { QuestionListPanel } from "@/components/questions/QuestionListPanel";
import { StudyPanel } from "@/components/study/StudyPanel";
import { PasteMapDialog } from "@/components/paste/PasteMapDialog";

import { Dashboard } from "@/app/(app)/dashboard/index";

export interface WorkspaceContextValue {
  selectedFolderId: string | null;
  filters: QuestionListFilters;
}

export function Workspace({
  initialTree,
  userRole,
  user,
  mode = "workspace",
  initialFolderId,
}: {
  initialTree: FolderTreeNode[];
  userRole: string;
  user: UserRecord | null;
  mode?: "workspace" | "dashboard" | "settings";
  initialFolderId?: string | null;
}) {
  const canEdit = userRole === "admin" || userRole === "editor";
  const isMobile = useIsMobile();
  // On mobile the three panels become a single swappable view driven by a
  // bottom tab bar; on desktop this is ignored and all three render at once.
  const [mobileView, setMobileView] = useState<StudyView>("questions");

  const [tree, setTree] = useState<FolderTreeNode[]>(initialTree);
  // Use initialFolderId if provided, otherwise default to first root folder.
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    initialFolderId ?? initialTree[0]?._id ?? null
  );
  const [filters, setFilters] = useState<
    Omit<QuestionListFilters, "folderId" | "cursor">
  >({ subtree: true });
  const [selectedQuestion, setSelectedQuestion] =
    useState<QuestionListItem | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionListItem | null>(null);
  // Bumped to force the question list to refetch (after bulk save, delete...).
  const [listRefreshKey, setListRefreshKey] = useState(0);
  // The questions currently loaded in the list panel — drives prev/next nav.
  const [loadedItems, setLoadedItems] = useState<QuestionListItem[]>([]);

  const selectedIndex = selectedQuestion
    ? loadedItems.findIndex((q) => q._id === selectedQuestion._id)
    : -1;

  const goPrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedQuestion(loadedItems[selectedIndex - 1]);
  }, [selectedIndex, loadedItems]);

  const goNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < loadedItems.length - 1)
      setSelectedQuestion(loadedItems[selectedIndex + 1]);
  }, [selectedIndex, loadedItems]);

  const refreshTree = useCallback(async () => {
    try {
      setTree(await foldersApi.tree());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load folders");
    }
  }, []);

  const refreshList = useCallback(() => {
    setListRefreshKey((k) => k + 1);
  }, []);

  const effectiveFilters: QuestionListFilters = useMemo(
    () => ({ ...filters, folderId: selectedFolderId ?? undefined }),
    [filters, selectedFolderId]
  );

  /**
   * After a create or edit save, fetch the saved question and select it so the
   * study panel opens immediately without needing a manual click.
   * On mobile it also switches to the study view.
   */
  const selectAfterSave = useCallback(async (questionId: string) => {
    try {
      const dto = await questionsApi.get(questionId);
      const listItem: QuestionListItem = {
        _id: dto._id,
        folderId: dto.folderId,
        collectionName: dto.collectionName,
        title: dto.title,
        status: dto.status,
        favorite: dto.favorite,
        tags: dto.tags,
        order: dto.order,
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
      };
      setSelectedQuestion(listItem);
      // Switch the selected folder to wherever the question lives, so the list
      // panel also shows it after the refresh.
      setSelectedFolderId(dto.folderId);
      setMobileView("study");
    } catch {
      // Non-fatal — the list still refreshes; user can click manually.
    }
  }, []);

  const folderSidebar = (
    <FolderSidebar
      tree={tree}
      selectedFolderId={selectedFolderId}
      onSelectFolder={(id) => {
        setSelectedFolderId(id);
        setSelectedQuestion(null);
        // On mobile, picking a folder reveals its questions.
        setMobileView("questions");
      }}
      onRefreshTree={refreshTree}
      user={user}
      canEdit={canEdit}
    />
  );

  const questionListPanel = (
    <QuestionListPanel
      key={`${selectedFolderId}-${listRefreshKey}`}
      filters={effectiveFilters}
      tree={tree}
      selectedQuestionId={selectedQuestion?._id ?? null}
      onSelectQuestion={(q) => {
        setSelectedQuestion(q);
        // On mobile, picking a question switches to the study view.
        setMobileView("study");
      }}
      onFiltersChange={setFilters}
      currentFilters={filters}
      onItemsLoaded={setLoadedItems}
      onMutated={(deletedId) => {
        if (deletedId && selectedQuestion?._id === deletedId) {
          setSelectedQuestion(null);
        }
        refreshTree();
      }}
      onEditQuestion={(q) => {
        setEditingQuestion(q);
        setPasteOpen(true);
      }}
      onOpenPaste={() => setPasteOpen(true)}
      canEdit={canEdit}
      user={user}
    />
  );

  const studyPanel = (
    <StudyPanel
      tree={tree}
      selected={selectedQuestion}
      position={
        selectedIndex >= 0
          ? { index: selectedIndex, total: loadedItems.length }
          : null
      }
      onPrev={goPrev}
      onNext={goNext}
      onChanged={() => {
        refreshList();
        refreshTree();
      }}
      onDeleted={() => {
        setSelectedQuestion(null);
        refreshList();
        refreshTree();
      }}
      canEdit={canEdit}
      user={user}
    />
  );

  const pasteDialog = (
    <PasteMapDialog
      open={pasteOpen}
      onOpenChange={(o) => {
        setPasteOpen(o);
        if (!o) setEditingQuestion(null);
      }}
      tree={tree}
      defaultFolderId={selectedFolderId}
      user={user}
      editQuestion={editingQuestion}
      onSaved={async (questionId) => {
        setEditingQuestion(null);
        refreshList();
        refreshTree();
        if (questionId) {
          await selectAfterSave(questionId);
        }
      }}
    />
  );

  // --- Mobile: a single active panel + bottom tab bar. ---
  if (isMobile) {
    // Dashboard view
    if (mode === "dashboard") {
      return (
        <div className="flex h-dvh flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto bg-background">
            <Dashboard user={user} tree={tree} />
          </div>
          <MobileBottomNav />
        </div>
      );
    }

    // Settings view
    if (mode === "settings") {
      return (
        <div className="flex h-dvh flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto bg-background p-8 flex items-center justify-center">
            <p className="text-muted-foreground">Settings Page</p>
          </div>
          <MobileBottomNav />
        </div>
      );
    }

    // Workspace / study-library view
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          {/* Keep all three mounted so list scroll position / loaded items and
              study state survive tab switches; just show the active one. */}
          <div className={cn("h-full overflow-y-auto", mobileView === "folders" ? "block" : "hidden")}>
            {folderSidebar}
          </div>
          <div className={cn("h-full overflow-y-auto", mobileView === "questions" ? "block" : "hidden")}>
            {questionListPanel}
          </div>
          <div className={cn("h-full overflow-y-auto", mobileView === "study" ? "block" : "hidden")}>
            {studyPanel}
          </div>
        </div>

        <MobileBottomNav
          studyView={mobileView}
          onStudyViewChange={setMobileView}
        />

        {pasteDialog}
      </div>
    );
  }

  // --- Desktop: the three-panel resizable workspace. ---
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-80 shrink-0 border-r border-border overflow-hidden bg-sidebar">
        {folderSidebar}
      </div>

      {mode === "dashboard" ? (
        <div className="flex-1 min-w-0 overflow-hidden bg-background">
          <Dashboard user={user} tree={tree} />
        </div>
      ) : mode === "settings" ? (
        <div className="flex-1 min-w-0 overflow-hidden bg-background p-8 flex items-center justify-center">
          <p className="text-muted-foreground">Settings Page</p>
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0">
          <ResizablePanel defaultSize={50} minSize={30} className="min-w-0 overflow-hidden">
            {questionListPanel}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={50} minSize={30} className="min-w-0 overflow-hidden">
            {studyPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {pasteDialog}
    </div>
  );
}
