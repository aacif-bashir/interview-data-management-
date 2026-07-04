"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { foldersApi } from "@/lib/api-client";
import type { FolderTreeNode, UserRecord } from "@/types";
import { toast } from "sonner";

interface WorkspaceContextValue {
  tree: FolderTreeNode[];
  refreshTree: () => Promise<void>;
  user: UserRecord | null;
  canEdit: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
  initialTree,
  user,
  userRole,
}: {
  children: ReactNode;
  initialTree: FolderTreeNode[];
  user: UserRecord | null;
  userRole: string;
}) {
  const [tree, setTree] = useState<FolderTreeNode[]>(initialTree);
  const canEdit = userRole === "admin" || userRole === "editor";

  const refreshTree = useCallback(async () => {
    try {
      setTree(await foldersApi.tree());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load folders");
    }
  }, []);

  return (
    <WorkspaceContext.Provider value={{ tree, refreshTree, user, canEdit }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
