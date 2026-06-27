"use client";

import { useState } from "react";
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  Pencil,
  Trash2,
  FolderPlus,
  MoveRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { foldersApi } from "@/lib/api-client";
import { InlineFolderInput } from "./InlineFolderInput";
import type { FolderTreeNode } from "@/types";

export function FolderNode({
  node,
  selectedFolderId,
  onSelectFolder,
  onRefreshTree,
  onRequestMove,
  canEdit = false,
}: {
  node: FolderTreeNode;
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onRefreshTree: () => void | Promise<void>;
  onRequestMove: (id: string) => void;
  canEdit?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);

  const hasChildren = node.children.length > 0;
  const isSelected = selectedFolderId === node._id;

  async function handleDelete() {
    const isEmpty = !hasChildren && node.questionCount === 0;
    if (!isEmpty) {
      const ok = window.confirm(
        `Delete "${node.name}" and ALL its subfolders and questions? This cannot be undone.`
      );
      if (!ok) return;
    }
    try {
      const res = await foldersApi.remove(node._id, !isEmpty);
      toast.success(
        `Deleted ${res.deletedFolders} folder(s), ${res.deletedQuestions} question(s)`
      );
      onRefreshTree();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (renaming) {
    return (
      <InlineFolderInput
        depth={node.depth}
        mode="rename"
        folderId={node._id}
        initialValue={node.name}
        onCancel={() => setRenaming(false)}
        onSubmit={() => {
          setRenaming(false);
          onRefreshTree();
        }}
      />
    );
  }

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectFolder(node._id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectFolder(node._id);
              }
            }}
            style={{ paddingLeft: node.depth * 14 + 6 }}
            className={cn(
              "group flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition-colors",
              "hover:bg-sidebar-accent",
              isSelected
                ? "bg-sidebar-accent font-medium text-foreground"
                : "text-sidebar-foreground/90"
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform hover:text-foreground",
                expanded && "rotate-90",
                !hasChildren && "invisible"
              )}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight className="size-3.5" />
            </button>
            {expanded && hasChildren ? (
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 truncate">{node.name}</span>
            {node.questionCount > 0 && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {node.questionCount}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
          {canEdit && (
            <ContextMenuContent className="w-48">
              <ContextMenuItem onClick={() => setCreatingChild(true)}>
                <FolderPlus className="size-4" /> New subfolder
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setRenaming(true)}>
                <Pencil className="size-4" /> Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onRequestMove(node._id)}>
                <MoveRight className="size-4" /> Move…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={handleDelete}>
                <Trash2 className="size-4" /> Delete
              </ContextMenuItem>
            </ContextMenuContent>
          )}
      </ContextMenu>

      {creatingChild && (
        <InlineFolderInput
          depth={node.depth + 1}
          parentId={node._id}
          placeholder="New subfolder"
          onCancel={() => setCreatingChild(false)}
          onSubmit={() => {
            setCreatingChild(false);
            setExpanded(true);
            onRefreshTree();
          }}
        />
      )}

      {expanded &&
        node.children.map((child) => (
          <FolderNode
            key={child._id}
            node={child}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            onRefreshTree={onRefreshTree}
            onRequestMove={onRequestMove}
            canEdit={canEdit}
          />
        ))}
    </div>
  );
}
