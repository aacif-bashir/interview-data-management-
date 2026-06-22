import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Folder, type FolderDocument } from "@/models/Folder";
import { Question } from "@/models/Question";
import { serializeFolder } from "./serialize";
import { conflict, notFound, DataError } from "./errors";
import type { FolderDTO, FolderTreeNode } from "@/types";

/** Lowercase slug for a single path segment. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}

function buildPath(parentPath: string | null, name: string): string {
  const seg = slug(name);
  if (!parentPath || parentPath === "/") return `/${seg}`;
  return `${parentPath}/${seg}`;
}

/** Translate a duplicate-key error into a friendly conflict. */
function asDuplicateConflict(err: unknown): never {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  ) {
    throw conflict("A folder with that name already exists here");
  }
  throw err;
}

/** Fetch all folders (flat) sorted by path. */
async function allFolders(): Promise<FolderDocument[]> {
  return Folder.find().sort({ path: 1 }).exec();
}

/** Build the full folder tree from a flat, path-sorted list. */
export async function getFolderTree(): Promise<FolderTreeNode[]> {
  await dbConnect();
  const docs = await allFolders();

  const byId = new Map<string, FolderTreeNode>();
  for (const doc of docs) {
    const dto = serializeFolder(doc);
    byId.set(dto._id, { ...dto, children: [] });
  }

  const roots: FolderTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically at every level.
  const sortRec = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
}

export async function getFolder(id: string): Promise<FolderDocument> {
  await dbConnect();
  if (!Types.ObjectId.isValid(id)) throw notFound("Folder");
  const doc = await Folder.findById(id).exec();
  if (!doc) throw notFound("Folder");
  return doc;
}

/** Folder with its breadcrumb chain (root -> self). */
export async function getFolderWithBreadcrumb(
  id: string
): Promise<{ folder: FolderDTO; breadcrumb: FolderDTO[] }> {
  const doc = await getFolder(id);
  const ancestorDocs = doc.ancestors.length
    ? await Folder.find({ _id: { $in: doc.ancestors } }).exec()
    : [];
  // Preserve ancestor order.
  const ancestorById = new Map(
    ancestorDocs.map((a) => [a._id.toString(), serializeFolder(a)])
  );
  const breadcrumb = doc.ancestors
    .map((a) => ancestorById.get(a.toString()))
    .filter((x): x is FolderDTO => Boolean(x));
  const self = serializeFolder(doc);
  return { folder: self, breadcrumb: [...breadcrumb, self] };
}

export async function createFolder(
  name: string,
  parentId: string | null
): Promise<FolderDTO> {
  await dbConnect();

  let ancestors: Types.ObjectId[] = [];
  let depth = 0;
  let parentPath: string | null = null;

  if (parentId) {
    const parent = await getFolder(parentId);
    ancestors = [...parent.ancestors, parent._id];
    depth = parent.depth + 1;
    parentPath = parent.path;
  }

  try {
    const doc = await Folder.create({
      name,
      parentId: parentId ? new Types.ObjectId(parentId) : null,
      ancestors,
      depth,
      path: buildPath(parentPath, name),
    });
    return serializeFolder(doc);
  } catch (err) {
    asDuplicateConflict(err);
  }
}

export async function renameFolder(
  id: string,
  name: string
): Promise<FolderDTO> {
  await dbConnect();
  const doc = await getFolder(id);

  const parentPath = doc.ancestors.length
    ? (await Folder.findById(doc.ancestors[doc.ancestors.length - 1]).exec())
        ?.path ?? null
    : null;
  const oldPath = doc.path;
  const newPath = buildPath(parentPath, name);

  doc.name = name;
  doc.path = newPath;
  try {
    await doc.save();
  } catch (err) {
    asDuplicateConflict(err);
  }

  // Rewrite descendant paths if the path changed.
  if (oldPath !== newPath) {
    await rewriteDescendantPaths(doc._id, oldPath, newPath);
  }

  return serializeFolder(doc);
}

/** Update `path` of all descendants after an ancestor's path changes. */
async function rewriteDescendantPaths(
  folderId: Types.ObjectId,
  oldPath: string,
  newPath: string
): Promise<void> {
  const descendants = await Folder.find({ ancestors: folderId }).exec();
  for (const d of descendants) {
    if (d.path.startsWith(oldPath + "/")) {
      d.path = newPath + d.path.slice(oldPath.length);
      await d.save();
    }
  }
}

export async function moveFolder(
  id: string,
  newParentId: string | null
): Promise<FolderDTO> {
  await dbConnect();
  const doc = await getFolder(id);

  // Cycle guards.
  if (newParentId === id) {
    throw new DataError("A folder cannot be moved into itself");
  }

  let newAncestors: Types.ObjectId[] = [];
  let newDepth = 0;
  let newParentPath: string | null = null;

  if (newParentId) {
    const newParent = await getFolder(newParentId);
    // Cannot move into one of its own descendants.
    if (newParent.ancestors.some((a) => a.toString() === id)) {
      throw new DataError("Cannot move a folder into its own descendant");
    }
    newAncestors = [...newParent.ancestors, newParent._id];
    newDepth = newParent.depth + 1;
    newParentPath = newParent.path;
  }

  const oldPath = doc.path;
  const oldAncestors = doc.ancestors.map((a) => a.toString());
  const newPath = buildPath(newParentPath, doc.name);

  doc.parentId = newParentId ? new Types.ObjectId(newParentId) : null;
  doc.ancestors = newAncestors;
  doc.depth = newDepth;
  doc.path = newPath;
  try {
    await doc.save();
  } catch (err) {
    asDuplicateConflict(err);
  }

  // Rewrite every descendant's ancestors/depth/path. Replace the old ancestor
  // prefix (everything up to and including this folder) with the new prefix.
  const descendants = await Folder.find({ ancestors: doc._id }).exec();
  const newPrefix = [...newAncestors, doc._id];
  const oldPrefixLen = oldAncestors.length + 1; // old ancestors + self
  const depthDelta = newDepth - (oldAncestors.length); // self's depth shift

  for (const d of descendants) {
    // Suffix of ancestors after this folder stays the same.
    const suffix = d.ancestors.slice(oldPrefixLen);
    d.ancestors = [...newPrefix, ...suffix];
    d.depth = d.depth + depthDelta;
    if (d.path.startsWith(oldPath + "/")) {
      d.path = newPath + d.path.slice(oldPath.length);
    }
    await d.save();
  }

  return serializeFolder(doc);
}

/**
 * Delete a folder. If it has subfolders or questions, requires `cascade=true`,
 * otherwise throws 409. Cascade deletes the whole subtree and its questions.
 */
export async function deleteFolder(
  id: string,
  cascade: boolean
): Promise<{ deletedFolders: number; deletedQuestions: number }> {
  await dbConnect();
  const doc = await getFolder(id);

  const subtreeFolderIds = [
    doc._id,
    ...(await Folder.find({ ancestors: doc._id }).select("_id").exec()).map(
      (f) => f._id
    ),
  ];

  const questionCount = await Question.countDocuments({
    folderId: { $in: subtreeFolderIds },
  });
  const hasChildren = subtreeFolderIds.length > 1;

  if (!cascade && (hasChildren || questionCount > 0)) {
    throw conflict(
      "Folder is not empty. Pass cascade=true to delete it and its contents."
    );
  }

  const delQ = await Question.deleteMany({
    folderId: { $in: subtreeFolderIds },
  });
  const delF = await Folder.deleteMany({ _id: { $in: subtreeFolderIds } });

  return {
    deletedFolders: delF.deletedCount ?? 0,
    deletedQuestions: delQ.deletedCount ?? 0,
  };
}
