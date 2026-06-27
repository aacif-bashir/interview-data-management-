/**
 * Folder data-access layer — Firestore implementation.
 *
 * Firestore data model
 * ────────────────────
 * Collection : "folders"
 * Document id: auto-generated Firestore doc id (used as _id in DTOs)
 *
 * Fields stored per folder:
 *   name          string
 *   parentId      string | null        – direct parent's doc id
 *   ancestors     string[]             – ordered root → immediate parent ids
 *   path          string               – slugified, e.g. "/frontend/react"
 *   depth         number
 *   questionCount number
 *   createdAt     Timestamp
 *   updatedAt     Timestamp
 *
 * Indexes required in Firestore (create in Firebase console or via terraform):
 *   - folders / path ASC                            (list + unique path check)
 *   - folders / parentId ASC, name ASC              (sibling uniqueness)
 *   - folders / ancestors (array-contains) ASC      (subtree / descendant queries)
 */

import {
  FieldValue,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getDb } from "@/firebase-services/admin";
import { conflict, notFound, DataError } from "@/lib/data/errors";
import type { FolderDTO, FolderTreeNode } from "@/types";

// ─── Collection reference ────────────────────────────────────────────────────

const COL = "folders";

function foldersCol() {
  return getDb().collection(COL);
}

// ─── Internal document shape ─────────────────────────────────────────────────

interface FolderDoc {
  name: string;
  parentId: string | null;
  ancestors: string[];
  path: string;
  depth: number;
  questionCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ─── Serialization ───────────────────────────────────────────────────────────

function docToDTO(
  snap: DocumentSnapshot | QueryDocumentSnapshot
): FolderDTO {
  const d = snap.data() as FolderDoc;
  return {
    _id: snap.id,
    name: d.name,
    parentId: d.parentId ?? null,
    ancestors: d.ancestors ?? [],
    path: d.path,
    depth: d.depth,
    questionCount: d.questionCount ?? 0,
    createdAt: d.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    updatedAt: d.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

function buildPath(parentPath: string | null, name: string): string {
  const seg = slug(name);
  if (!parentPath || parentPath === "/") return `/${seg}`;
  return `${parentPath}/${seg}`;
}

// ─── Conflict guard ───────────────────────────────────────────────────────────

/** Check Firestore for a sibling with the same name and throw 409 if found. */
async function assertNoDuplicateSibling(
  parentId: string | null,
  name: string,
  excludeId?: string
): Promise<void> {
  const q = foldersCol()
    .where("parentId", "==", parentId)
    .where("name", "==", name)
    .limit(2);
  const snap = await q.get();
  const clash = snap.docs.find((d) => d.id !== excludeId);
  if (clash) throw conflict("A folder with that name already exists here");
}

// ─── Internal fetcher ────────────────────────────────────────────────────────

async function getRawFolder(
  id: string
): Promise<QueryDocumentSnapshot<FolderDoc>> {
  const ref = foldersCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("Folder");
  return snap as QueryDocumentSnapshot<FolderDoc>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build the full folder tree from Firestore (path-sorted). */
export async function getFolderTree(): Promise<FolderTreeNode[]> {
  const snap = await foldersCol().orderBy("path").get();

  const byId = new Map<string, FolderTreeNode>();
  for (const doc of snap.docs) {
    const dto = docToDTO(doc);
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

  const sortRec = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
}

export async function getFolder(id: string): Promise<FolderDTO> {
  const snap = await getRawFolder(id);
  return docToDTO(snap);
}

/** Folder DTO with breadcrumb chain (root → self). */
export async function getFolderWithBreadcrumb(
  id: string
): Promise<{ folder: FolderDTO; breadcrumb: FolderDTO[] }> {
  const snap = await getRawFolder(id);
  const dto = docToDTO(snap);
  const ancestors = (snap.data() as FolderDoc).ancestors ?? [];

  let breadcrumb: FolderDTO[] = [];
  if (ancestors.length > 0) {
    // Fetch all ancestors in one batched read.
    const refs = ancestors.map((aid) => foldersCol().doc(aid));
    const snaps = await getDb().getAll(...refs);
    const byId = new Map<string, FolderDTO>();
    for (const s of snaps) {
      if (s.exists) byId.set(s.id, docToDTO(s));
    }
    // Preserve ancestor order.
    breadcrumb = ancestors
      .map((aid) => byId.get(aid))
      .filter((x): x is FolderDTO => Boolean(x));
  }

  return { folder: dto, breadcrumb: [...breadcrumb, dto] };
}

export async function createFolder(
  name: string,
  parentId: string | null
): Promise<FolderDTO> {
  let ancestors: string[] = [];
  let depth = 0;
  let parentPath: string | null = null;

  if (parentId) {
    const parentSnap = await getRawFolder(parentId);
    const parentData = parentSnap.data() as FolderDoc;
    ancestors = [...(parentData.ancestors ?? []), parentSnap.id];
    depth = parentData.depth + 1;
    parentPath = parentData.path;
  }

  await assertNoDuplicateSibling(parentId, name);

  const path = buildPath(parentPath, name);

  // Also ensure the path itself is unique.
  const pathCheck = await foldersCol().where("path", "==", path).limit(1).get();
  if (!pathCheck.empty) {
    throw conflict("A folder with that name already exists here");
  }

  const now = FieldValue.serverTimestamp();
  const ref = await foldersCol().add({
    name,
    parentId: parentId ?? null,
    ancestors,
    depth,
    path,
    questionCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ref.get();
  return docToDTO(created);
}

export async function renameFolder(
  id: string,
  name: string
): Promise<FolderDTO> {
  const snap = await getRawFolder(id);
  const data = snap.data() as FolderDoc;

  await assertNoDuplicateSibling(data.parentId, name, id);

  const parentPath =
    data.ancestors.length > 0
      ? ((await getRawFolder(data.ancestors[data.ancestors.length - 1])).data() as FolderDoc).path
      : null;

  const oldPath = data.path;
  const newPath = buildPath(parentPath, name);

  await snap.ref.update({ name, path: newPath, updatedAt: FieldValue.serverTimestamp() });

  // Rewrite descendant paths if the path changed.
  if (oldPath !== newPath) {
    await rewriteDescendantPaths(id, oldPath, newPath);
  }

  const updated = await snap.ref.get();
  return docToDTO(updated);
}

/** Update `path` of all descendants after an ancestor's path changes. */
async function rewriteDescendantPaths(
  folderId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const descendants = await foldersCol()
    .where("ancestors", "array-contains", folderId)
    .get();

  // Firestore limits batch writes to 500 ops.
  const BATCH_SIZE = 400;
  let batch = getDb().batch();
  let opCount = 0;

  for (const d of descendants.docs) {
    const dData = d.data() as FolderDoc;
    if (dData.path.startsWith(oldPath + "/")) {
      const updatedPath = newPath + dData.path.slice(oldPath.length);
      batch.update(d.ref, { path: updatedPath, updatedAt: FieldValue.serverTimestamp() });
      opCount++;
      if (opCount >= BATCH_SIZE) {
        await batch.commit();
        batch = getDb().batch();
        opCount = 0;
      }
    }
  }

  if (opCount > 0) await batch.commit();
}

export async function moveFolder(
  id: string,
  newParentId: string | null
): Promise<FolderDTO> {
  const snap = await getRawFolder(id);
  const data = snap.data() as FolderDoc;

  if (newParentId === id) {
    throw new DataError("A folder cannot be moved into itself");
  }

  let newAncestors: string[] = [];
  let newDepth = 0;
  let newParentPath: string | null = null;

  if (newParentId) {
    const newParentSnap = await getRawFolder(newParentId);
    const newParentData = newParentSnap.data() as FolderDoc;

    // Cannot move into one of its own descendants.
    if ((newParentData.ancestors ?? []).includes(id)) {
      throw new DataError("Cannot move a folder into its own descendant");
    }

    newAncestors = [...(newParentData.ancestors ?? []), newParentSnap.id];
    newDepth = newParentData.depth + 1;
    newParentPath = newParentData.path;
  }

  await assertNoDuplicateSibling(newParentId, data.name, id);

  const oldPath = data.path;
  const oldAncestors = data.ancestors ?? [];
  const newPath = buildPath(newParentPath, data.name);

  const depthDelta = newDepth - oldAncestors.length; // self's depth shift
  const oldPrefixLen = oldAncestors.length + 1; // old ancestors + self

  await snap.ref.update({
    parentId: newParentId ?? null,
    ancestors: newAncestors,
    depth: newDepth,
    path: newPath,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Rewrite every descendant's ancestors / depth / path.
  const descendants = await foldersCol()
    .where("ancestors", "array-contains", id)
    .get();

  const BATCH_SIZE = 400;
  let batch = getDb().batch();
  let opCount = 0;

  const newPrefix = [...newAncestors, id];

  for (const d of descendants.docs) {
    const dData = d.data() as FolderDoc;
    const suffix = (dData.ancestors ?? []).slice(oldPrefixLen);
    const updatedAncestors = [...newPrefix, ...suffix];
    const updatedDepth = dData.depth + depthDelta;
    const updatedPath = dData.path.startsWith(oldPath + "/")
      ? newPath + dData.path.slice(oldPath.length)
      : dData.path;

    batch.update(d.ref, {
      ancestors: updatedAncestors,
      depth: updatedDepth,
      path: updatedPath,
      updatedAt: FieldValue.serverTimestamp(),
    });
    opCount++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch = getDb().batch();
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();

  const updated = await snap.ref.get();
  return docToDTO(updated);
}

/**
 * Delete a folder. Requires `cascade=true` if it has subfolders or questions,
 * otherwise throws 409. Cascade deletes the whole subtree and its questions.
 */
export async function deleteFolder(
  id: string,
  cascade: boolean
): Promise<{ deletedFolders: number; deletedQuestions: number }> {
  await getRawFolder(id); // validate existence

  // Collect all folder ids in the subtree.
  const descendantsSnap = await foldersCol()
    .where("ancestors", "array-contains", id)
    .get();

  const subtreeFolderIds = [id, ...descendantsSnap.docs.map((d) => d.id)];
  const hasChildren = subtreeFolderIds.length > 1;

  // Count questions in the subtree.
  const db = getDb();
  const questionsCol = db.collection("questions");
  let questionCount = 0;
  // Firestore `in` queries are limited to 30 items per call.
  for (let i = 0; i < subtreeFolderIds.length; i += 30) {
    const chunk = subtreeFolderIds.slice(i, i + 30);
    const qSnap = await questionsCol.where("folderId", "in", chunk).get();
    questionCount += qSnap.size;
  }

  if (!cascade && (hasChildren || questionCount > 0)) {
    throw conflict(
      "Folder is not empty. Pass cascade=true to delete it and its contents."
    );
  }

  // Delete all questions in the subtree.
  let deletedQuestions = 0;
  const BATCH_SIZE = 400;

  for (let i = 0; i < subtreeFolderIds.length; i += 30) {
    const chunk = subtreeFolderIds.slice(i, i + 30);
    const qSnap = await questionsCol.where("folderId", "in", chunk).get();
    let batch = db.batch();
    let opCount = 0;
    for (const qDoc of qSnap.docs) {
      batch.delete(qDoc.ref);
      deletedQuestions++;
      opCount++;
      if (opCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();
  }

  // Delete all folders in the subtree.
  let fBatch = db.batch();
  let fOpCount = 0;
  for (const fid of subtreeFolderIds) {
    fBatch.delete(foldersCol().doc(fid));
    fOpCount++;
    if (fOpCount >= BATCH_SIZE) {
      await fBatch.commit();
      fBatch = db.batch();
      fOpCount = 0;
    }
  }
  if (fOpCount > 0) await fBatch.commit();

  return {
    deletedFolders: subtreeFolderIds.length,
    deletedQuestions,
  };
}
