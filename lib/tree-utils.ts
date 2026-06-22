import type { FolderTreeNode } from "@/types";

export interface FlatFolder {
  _id: string;
  name: string;
  depth: number;
  path: string;
}

/** Flatten a folder tree (depth-first) into an indented list for pickers. */
export function flattenTree(nodes: FolderTreeNode[]): FlatFolder[] {
  const out: FlatFolder[] = [];
  const walk = (list: FolderTreeNode[]) => {
    for (const n of list) {
      out.push({ _id: n._id, name: n.name, depth: n.depth, path: n.path });
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Find a node by id anywhere in the tree. */
export function findNode(
  nodes: FolderTreeNode[],
  id: string
): FolderTreeNode | null {
  for (const n of nodes) {
    if (n._id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}
