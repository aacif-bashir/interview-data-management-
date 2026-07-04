import { getFolderTree } from "@/firebase-services/folders";
import { Workspace } from "@/components/workspace/Workspace";
import { cookies } from "next/headers";
import { verifySessionCookie, getUserRecord, SESSION_COOKIE } from "@/firebase-services/auth";
import type { FolderTreeNode } from "@/types";

export const dynamic = "force-dynamic";

/** Flatten tree to find folder by name slug (lowercased, spaces→hyphens). */
function findFolderBySlug(nodes: FolderTreeNode[], slug: string): FolderTreeNode | null {
  for (const node of nodes) {
    const nodeSlug = node.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
    if (nodeSlug === slug) return node;
    const found = findFolderBySlug(node.children, slug);
    if (found) return found;
  }
  return null;
}

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const decoded = await verifySessionCookie(sessionCookie);
  const user = decoded ? await getUserRecord(decoded.uid) : null;
  const userRole = user?.role ?? "viewer";

  const tree = await getFolderTree();

  // The `id` param is actually the folder name slug, e.g. "java-by-ashwani"
  const folderSlug = decodeURIComponent(resolvedParams.id);
  const matchedFolder = findFolderBySlug(tree, folderSlug);

  return (
    <Workspace
      initialTree={tree}
      userRole={userRole}
      user={user}
      mode="workspace"
      initialFolderId={matchedFolder?._id ?? null}
    />
  );
}

