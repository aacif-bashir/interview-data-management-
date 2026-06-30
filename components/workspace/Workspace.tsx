"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderTree, ListChecks, BookOpen } from "lucide-react";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { foldersApi } from "@/lib/api-client";
import type {
  FolderTreeNode,
  QuestionListFilters,
  QuestionListItem,
  UserRecord,
} from "@/types";
import { FolderSidebar } from "@/components/folders/FolderSidebar";
import { QuestionListPanel } from "@/components/questions/QuestionListPanel";
import { StudyPanel } from "@/components/study/StudyPanel";
import { PasteMapDialog } from "@/components/paste/PasteMapDialog";

export interface WorkspaceContextValue {
  selectedFolderId: string | null;
  filters: QuestionListFilters;
}

export function Workspace({
  initialTree,
  userRole,
  user,
}: {
  initialTree: FolderTreeNode[];
  userRole: string;
  user: UserRecord | null;
}) {
  const canEdit = userRole === "admin" || userRole === "editor";
  const isMobile = useIsMobile();
  // On mobile the three panels become a single swappable view driven by a
  // bottom tab bar; on desktop this is ignored and all three render at once.
  const [mobileView, setMobileView] = useState<
    "folders" | "questions" | "study"
  >("questions");

  const [tree, setTree] = useState<FolderTreeNode[]>(initialTree);
  // Default to the first root folder if one exists.
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    initialTree[0]?._id ?? null
  );
  const [filters, setFilters] = useState<
    Omit<QuestionListFilters, "folderId" | "cursor">
  >({ subtree: true });
  const [selectedQuestion, setSelectedQuestion] =
    useState<QuestionListItem | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
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
      onOpenPaste={() => setPasteOpen(true)}
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
      onOpenChange={setPasteOpen}
      tree={tree}
      defaultFolderId={selectedFolderId}
      user={user}
      onSaved={() => {
        refreshList();
        refreshTree();
      }}
    />
  );

  // --- Mobile: a single active panel + bottom tab bar. ---
  if (isMobile) {
    const tabs = [
      { id: "folders" as const, label: "Folders", icon: FolderTree },
      { id: "questions" as const, label: "Questions", icon: ListChecks },
      { id: "study" as const, label: "Study", icon: BookOpen },
    ];
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

        <nav className="flex shrink-0 items-stretch border-t bg-sidebar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = mobileView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileView(tab.id)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {pasteDialog}
      </div>
    );
  }

  // --- Desktop: the three-panel resizable workspace. ---
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize="20" minSize="14" maxSize="32" className="min-w-0 overflow-hidden">
          {folderSidebar}
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="42" minSize="28" className="min-w-0 overflow-hidden">
          {questionListPanel}
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="38" minSize="24" className="min-w-0 overflow-hidden">
          {studyPanel}
        </ResizablePanel>
      </ResizablePanelGroup>

      {pasteDialog}
    </div>
  );
}
