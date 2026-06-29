"use client";

import { useState } from "react";
import { FolderPlus, ClipboardPaste, Library, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import { LogoutButton } from "@/components/workspace/LogoutButton";
import { FolderNode } from "./FolderNode";
import { InlineFolderInput } from "./InlineFolderInput";
import { MoveFolderDialog } from "./MoveFolderDialog";
import { MigrateDialog } from "@/components/workspace/MigrateDialog";
import type { FolderTreeNode } from "@/types";
import type { UserRecord } from "@/types";

export function FolderSidebar({
  tree,
  selectedFolderId,
  onSelectFolder,
  onRefreshTree,
  onOpenPaste,
  user,
  canEdit = false,
}: {
  tree: FolderTreeNode[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onRefreshTree: () => void | Promise<void>;
  onOpenPaste: () => void;
  user?: UserRecord | null;
  canEdit?: boolean;
}) {
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [migrateOpen, setMigrateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Library className="size-4" />
          </span>
          <span className="tracking-tight">Data Mng</span>
        </div>
        <ThemeToggle />
      </div>

      {canEdit && (
        <>
          <div className="px-3 pb-3">
            <Button
              size="default"
              className="w-full justify-center"
              onClick={onOpenPaste}
            >
              <ClipboardPaste className="size-4" /> Paste &amp; Map
            </Button>
          </div>

          <Separator />
        </>
      )}

      <ScrollArea className="flex-1">
        <div className="px-1.5 py-2">
          <div className="flex items-center justify-between px-1.5 pb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Folders
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => setCreatingRoot(true)}
                className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                title="New folder"
                aria-label="New folder"
              >
                <FolderPlus className="size-3.5" />
              </button>
            )}
          </div>

          {creatingRoot && (
            <InlineFolderInput
              depth={0}
              placeholder="New folder name"
              onCancel={() => setCreatingRoot(false)}
              onSubmit={() => {
                setCreatingRoot(false);
                onRefreshTree();
              }}
              parentId={null}
            />
          )}

          {tree.length === 0 && !creatingRoot && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No folders yet.
              <br />
              Click + to create one.
            </p>
          )}

          {tree.map((node) => (
            <FolderNode
              key={node._id}
              node={node}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onRefreshTree={onRefreshTree}
              onRequestMove={setMovingId}
              canEdit={canEdit}
            />
          ))}
        </div>
      </ScrollArea>

      <Separator />
      <div className="px-2 py-2 space-y-1">
        {canEdit && (
          <button
            type="button"
            onClick={() => setMigrateOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            title="Migrate legacy questions into folder collections"
          >
            <DatabaseZap className="size-3.5 shrink-0" />
            Migrate legacy data
          </button>
        )}
        <LogoutButton />
      </div>

      <MoveFolderDialog
        key={movingId ?? "none"}
        tree={tree}
        movingId={movingId}
        onClose={() => setMovingId(null)}
        onMoved={() => {
          setMovingId(null);
          onRefreshTree();
        }}
      />

      <MigrateDialog
        open={migrateOpen}
        onOpenChange={setMigrateOpen}
        user={user ?? null}
      />
    </div>
  );
}
