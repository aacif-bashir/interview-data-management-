"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  writeBatch,
  serverTimestamp,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Query,
  type DocumentData,
} from "firebase/firestore";
import { getClientDb, ensureFirebaseAuthReady } from "@/firebase-services/client";
import type {
  DuplicateMatch,
  FolderDTO,
  FolderTreeNode,
  PaginatedQuestions,
  QuestionDTO,
  QuestionListFilters,
  QuestionListItem,
  QuestionStatus,
} from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function foldersCol() { return collection(getClientDb(), "folders"); }
function qindexCol() { return collection(getClientDb(), "_qindex"); }
function folderQuestionsCol(colName: string) { return collection(getClientDb(), colName); }

function slug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.toLowerCase().replace(/\s+/g, " ").trim()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function deriveTitle(question: string): string {
  const line = question.split("\n").map(l => l.trim()).find(l => l.length > 0 && !l.startsWith("```")) ?? "";
  return line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").slice(0, 120);
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  return Array.from(new Set(tags.map(t => t.toLowerCase().trim()).filter(Boolean)));
}

const ORDER_GAP = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function ts(f: unknown): string {
  return f && typeof (f as { toDate?: () => Date }).toDate === "function"
    ? (f as { toDate: () => Date }).toDate().toISOString()
    : new Date().toISOString();
}

function snapToFolder(snap: DocumentSnapshot | QueryDocumentSnapshot): FolderDTO {
  const d = snap.data() as Record<string, unknown>;
  return {
    _id: snap.id,
    name: d.name as string,
    parentId: (d.parentId as string | null) ?? null,
    ancestors: (d.ancestors as string[]) ?? [],
    path: d.path as string,
    depth: d.depth as number,
    questionCount: (d.questionCount as number) ?? 0,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
    createdBy: (d.createdBy as { id: string; name: string; email: string } | null) ?? null,
  };
}

function snapToQuestion(snap: DocumentSnapshot | QueryDocumentSnapshot): QuestionDTO {
  const d = snap.data() as Record<string, unknown>;
  return {
    _id: snap.id,
    folderId: d.folderId as string,
    title: (d.title as string) ?? "",
    question: d.question as string,
    answer: (d.answer as string) ?? "",
    status: d.status as QuestionDTO["status"],
    favorite: d.favorite as boolean,
    tags: (d.tags as string[]) ?? [],
    order: d.order as number,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

function snapToListItem(snap: DocumentSnapshot | QueryDocumentSnapshot): QuestionListItem {
  const d = snap.data() as Record<string, unknown>;
  return {
    _id: snap.id,
    folderId: d.folderId as string,
    title: (d.title as string) ?? "",
    status: d.status as QuestionListItem["status"],
    favorite: d.favorite as boolean,
    tags: (d.tags as string[]) ?? [],
    order: d.order as number,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

function encodeCursor(order: number, id: string): string { return btoa(`${order}:${id}`); }
function decodeCursor(raw: string): { order: number; id: string } | null {
  try {
    const [order, id] = atob(raw).split(":");
    if (!order || !id) return null;
    return { order: Number(order), id };
  } catch { return null; }
}

function buildTree(dtos: FolderDTO[]): FolderTreeNode[] {
  const byId = new Map<string, FolderTreeNode>();
  for (const dto of dtos) byId.set(dto._id, { ...dto, children: [] });
  const roots: FolderTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: FolderTreeNode[]) => { nodes.sort((a, b) => a.name.localeCompare(b.name)); nodes.forEach(n => sort(n.children)); };
  sort(roots);
  return roots;
}

/** Get collectionName for a folder from Firestore. */
async function getCollectionName(folderId: string): Promise<string> {
  const snap = await getDoc(doc(foldersCol(), folderId));
  if (!snap.exists()) throw new Error("Folder not found");
  return (snap.data() as Record<string, unknown>).collectionName as string;
}

/** Lookup which collection a question lives in via _qindex.
 *  Falls back to scanning folder collections when the index entry is missing
 *  (e.g. docs created directly in Firestore or before _qindex was implemented).
 *  On a successful fallback the missing _qindex entry is backfilled automatically.
 */
async function resolveQuestionLocation(questionId: string): Promise<{ collectionName: string; folderId: string }> {
  // 1. Fast path: check the central index.
  const indexSnap = await getDoc(doc(qindexCol(), questionId));
  if (indexSnap.exists()) {
    const d = indexSnap.data() as Record<string, unknown>;
    return { collectionName: d.collectionName as string, folderId: d.folderId as string };
  }

  // 2. Slow-path fallback: scan all folder collections.
  //    Each question document stores its own `collectionName` and `folderId` fields.
  const db = getClientDb();
  const allFolders = await getDocs(foldersCol());
  for (const fd of allFolders.docs) {
    const cn = (fd.data() as Record<string, unknown>).collectionName as string | undefined;
    if (!cn) continue;
    const qSnap = await getDoc(doc(db, cn, questionId));
    if (qSnap.exists()) {
      const qData = qSnap.data() as Record<string, unknown>;
      const folderId = (qData.folderId as string | undefined) ?? fd.id;
      const collectionName = (qData.collectionName as string | undefined) ?? cn;
      // 3. Backfill the missing _qindex entry so next lookup is fast.
      try {
        await setDoc(doc(qindexCol(), questionId), { collectionName, folderId });
      } catch { /* non-critical — ignore write errors */ }
      return { collectionName, folderId };
    }
  }

  throw new Error("Question not found");
}

async function nextOrder(collectionName: string): Promise<number> {
  const snap = await getDocs(query(folderQuestionsCol(collectionName), orderBy("order", "desc"), limit(1)));
  if (snap.empty) return ORDER_GAP;
  return (snap.docs[0].data() as Record<string, unknown>).order as number + ORDER_GAP;
}

// ─── foldersApi ──────────────────────────────────────────────────────────────

export const foldersApi = {
  async tree(): Promise<FolderTreeNode[]> {
    const snap = await getDocs(query(foldersCol(), orderBy("path")));
    return buildTree(snap.docs.map(snapToFolder));
  },

  async create(name: string, parentId: string | null, createdBy?: { id: string; name: string; email: string } | null): Promise<FolderDTO> {
    await ensureFirebaseAuthReady();
    const db = getClientDb();
    let ancestors: string[] = [];
    let depth = 0;
    let parentPath: string | null = null;

    if (parentId) {
      const pSnap = await getDoc(doc(foldersCol(), parentId));
      if (!pSnap.exists()) throw new Error("Parent folder not found");
      const pd = pSnap.data() as Record<string, unknown>;
      ancestors = [...((pd.ancestors as string[]) ?? []), pSnap.id];
      depth = (pd.depth as number) + 1;
      parentPath = pd.path as string;
    }

    const seg = slug(name);
    const path = parentPath && parentPath !== "/" ? `${parentPath}/${seg}` : `/${seg}`;
    // Make collectionName unique: use slug + short random suffix to avoid conflicts
    const collectionName = depth === 0 ? seg : `${seg}_${Math.random().toString(36).slice(2, 6)}`;

    // 1. Add folder metadata to `folders` registry
    const ref = await addDoc(foldersCol(), {
      name, parentId: parentId ?? null, ancestors, depth, path,
      collectionName,
      questionCount: 0,
      createdBy: createdBy ?? null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });

    // 2. Create the folder-named collection by writing a _meta doc to it.
    //    This makes "python" appear as a top-level collection in the Firebase console.
    await setDoc(doc(db, collectionName, "_meta"), {
      isFolder: true,
      name,
      folderId: ref.id,
      parentId: parentId ?? null,
      createdBy: createdBy ?? null,
      createdAt: serverTimestamp(),
    });

    const created = await getDoc(ref);
    return snapToFolder(created);
  },

  async rename(id: string, name: string): Promise<FolderDTO> {
    await ensureFirebaseAuthReady();
    const ref = doc(foldersCol(), id);
    // Note: collectionName is intentionally NOT changed on rename to keep
    // question documents stable. Only the display name changes.
    await updateDoc(ref, { name, updatedAt: serverTimestamp() });
    // Also update _meta in the folder collection (use merge so it's safe if _meta is absent).
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const colName = (snap.data() as Record<string, unknown>).collectionName as string;
      if (colName) {
        await setDoc(doc(getClientDb(), colName, "_meta"), { name }, { merge: true });
      }
    }
    const updated = await getDoc(ref);
    return snapToFolder(updated);
  },

  async move(id: string, newParentId: string | null): Promise<FolderDTO> {
    await ensureFirebaseAuthReady();
    const ref = doc(foldersCol(), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Folder not found");
    const data = snap.data() as Record<string, unknown>;
    let newAncestors: string[] = [];
    let newDepth = 0;
    let newParentPath: string | null = null;
    if (newParentId) {
      const pSnap = await getDoc(doc(foldersCol(), newParentId));
      if (!pSnap.exists()) throw new Error("Destination folder not found");
      const pd = pSnap.data() as Record<string, unknown>;
      newAncestors = [...((pd.ancestors as string[]) ?? []), pSnap.id];
      newDepth = (pd.depth as number) + 1;
      newParentPath = pd.path as string;
    }
    const seg = slug(data.name as string);
    const newPath = newParentPath && newParentPath !== "/" ? `${newParentPath}/${seg}` : `/${seg}`;
    await updateDoc(ref, { parentId: newParentId ?? null, ancestors: newAncestors, depth: newDepth, path: newPath, updatedAt: serverTimestamp() });
    const updated = await getDoc(ref);
    return snapToFolder(updated);
  },

  async remove(id: string, cascade: boolean): Promise<{ deletedFolders: number; deletedQuestions: number }> {
    await ensureFirebaseAuthReady();
    const db = getClientDb();
    const descSnap = await getDocs(query(foldersCol(), where("ancestors", "array-contains", id)));
    const allFolderDocs = [(await getDoc(doc(foldersCol(), id))), ...descSnap.docs];
    const folderIds = [id, ...descSnap.docs.map(d => d.id)];
    const hasChildren = folderIds.length > 1;

    // Count questions across all folder collections
    let totalQuestions = 0;
    const folderColNames: string[] = [];
    for (const fd of allFolderDocs) {
      if (!fd.exists()) continue;
      const cn = (fd.data() as Record<string, unknown>).collectionName as string;
      if (cn) folderColNames.push(cn);
      const qSnap = await getDocs(query(folderQuestionsCol(cn), orderBy("order")));
      totalQuestions += qSnap.docs.filter(d => d.id !== "_meta").length;
    }

    if (!cascade && (hasChildren || totalQuestions > 0)) {
      throw new Error("Folder is not empty. Cascade delete required.");
    }

    let deletedQuestions = 0;
    for (const cn of folderColNames) {
      const qSnap = await getDocs(folderQuestionsCol(cn));
      let batch = writeBatch(db); let ops = 0;
      for (const qDoc of qSnap.docs) {
        batch.delete(qDoc.ref);
        if (qDoc.id !== "_meta") {
          batch.delete(doc(qindexCol(), qDoc.id));
          deletedQuestions++;
          ops += 2;
        } else { ops++; }
        if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
      }
      if (ops > 0) await batch.commit();
    }

    let fBatch = writeBatch(db); let fOps = 0;
    for (const fid of folderIds) {
      fBatch.delete(doc(foldersCol(), fid)); fOps++;
      if (fOps >= 400) { await fBatch.commit(); fBatch = writeBatch(db); fOps = 0; }
    }
    if (fOps > 0) await fBatch.commit();

    return { deletedFolders: folderIds.length, deletedQuestions };
  },
};

// ─── questionsApi ─────────────────────────────────────────────────────────────

async function resolveFolderIds(folderId: string, subtree: boolean): Promise<string[]> {
  if (!subtree) return [folderId];
  const snap = await getDocs(query(foldersCol(), where("ancestors", "array-contains", folderId)));
  return [folderId, ...snap.docs.map(d => d.id)];
}

export const questionsApi = {
  async list(filters: QuestionListFilters): Promise<PaginatedQuestions> {
    const lim = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    // Resolve folder IDs
    let folderIds: string[] | null = null;
    if (filters.folderId) {
      folderIds = await resolveFolderIds(filters.folderId, Boolean(filters.subtree));
    }

    // Get collectionName for each folderId
    const folderMeta: { id: string; colName: string }[] = [];
    if (folderIds) {
      const snaps = await Promise.all(folderIds.map(id => getDoc(doc(foldersCol(), id))));
      for (const s of snaps) {
        if (s.exists()) {
          const cn = (s.data() as Record<string, unknown>).collectionName as string;
          if (cn) folderMeta.push({ id: s.id, colName: cn });
        }
      }
    }

    // Gather docs from all relevant collections
    const allDocs: QueryDocumentSnapshot[] = [];
    if (folderMeta.length > 0) {
      for (const { colName } of folderMeta) {
        let q: Query<DocumentData> = folderQuestionsCol(colName) as Query<DocumentData>;
        if (filters.status) q = query(q, where("status", "==", filters.status)) as Query<DocumentData>;
        if (typeof filters.favorite === "boolean") q = query(q, where("favorite", "==", filters.favorite)) as Query<DocumentData>;
        // orderBy("order") automatically excludes _meta (no order field)
        q = query(q, orderBy("order")) as Query<DocumentData>;
        const snap = await getDocs(q);
        allDocs.push(...snap.docs as QueryDocumentSnapshot[]);
      }
    } else {
      // No folder filter — can't query across dynamic collections efficiently.
      // Fetch all folders and query each.
      const allFolders = await getDocs(foldersCol());
      for (const fd of allFolders.docs) {
        const cn = (fd.data() as Record<string, unknown>).collectionName as string;
        if (!cn) continue;
        let q: Query<DocumentData> = folderQuestionsCol(cn) as Query<DocumentData>;
        if (filters.status) q = query(q, where("status", "==", filters.status)) as Query<DocumentData>;
        q = query(q, orderBy("order")) as Query<DocumentData>;
        const snap = await getDocs(q);
        allDocs.push(...snap.docs as QueryDocumentSnapshot[]);
      }
    }

    // Text search
    if (filters.q?.trim()) {
      const term = filters.q.trim().toLowerCase();
      const matched = allDocs.filter(d => {
        const data = d.data() as Record<string, unknown>;
        return (data.title as string)?.toLowerCase().includes(term) ||
          (data.question as string)?.toLowerCase().includes(term) ||
          ((data.tags as string[]) ?? []).some(t => t.includes(term));
      });
      const skip = filters.cursor ? Number(filters.cursor) || 0 : 0;
      const page = matched.slice(skip, skip + lim + 1);
      const hasMore = page.length > lim;
      return { items: (hasMore ? page.slice(0, lim) : page).map(snapToListItem), nextCursor: hasMore ? String(skip + lim) : null, total: null };
    }

    // Sort and paginate
    allDocs.sort((a, b) => {
      const ao = (a.data() as Record<string, unknown>).order as number;
      const bo = (b.data() as Record<string, unknown>).order as number;
      return ao - bo || a.id.localeCompare(b.id);
    });

    let startIdx = 0;
    if (filters.cursor) {
      const c = decodeCursor(filters.cursor);
      if (c) {
        startIdx = allDocs.findIndex(d => {
          const o = (d.data() as Record<string, unknown>).order as number;
          return o > c.order || (o === c.order && d.id > c.id);
        });
        if (startIdx === -1) startIdx = allDocs.length;
      }
    }

    const page = allDocs.slice(startIdx, startIdx + lim + 1);
    const hasMore = page.length > lim;
    const visible = hasMore ? page.slice(0, lim) : page;
    const last = visible[visible.length - 1];
    return {
      items: visible.map(snapToListItem),
      nextCursor: hasMore && last ? encodeCursor((last.data() as Record<string, unknown>).order as number, last.id) : null,
      total: null,
    };
  },

  async get(id: string): Promise<QuestionDTO> {
    const { collectionName } = await resolveQuestionLocation(id);
    const snap = await getDoc(doc(folderQuestionsCol(collectionName), id));
    if (!snap.exists()) throw new Error("Question not found");
    return snapToQuestion(snap);
  },

  async create(input: { folderId: string; question: string; answer: string; tags?: string[]; status?: QuestionStatus }): Promise<QuestionDTO> {
    await ensureFirebaseAuthReady();
    const colName = await getCollectionName(input.folderId);
    const order = await nextOrder(colName);
    const hash = await sha256(input.question);
    const ref = await addDoc(folderQuestionsCol(colName), {
      folderId: input.folderId, collectionName: colName, order,
      question: input.question, answer: input.answer ?? "",
      title: deriveTitle(input.question),
      tags: normalizeTags(input.tags),
      status: input.status ?? "not_studied",
      favorite: false, contentHash: hash,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    // Write index entry
    await setDoc(doc(qindexCol(), ref.id), { collectionName: colName, folderId: input.folderId });
    await setDoc(doc(foldersCol(), input.folderId), { questionCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
    const created = await getDoc(ref);
    return snapToQuestion(created);
  },

  async update(id: string, patch: Partial<{ question: string; answer: string; tags: string[]; status: QuestionStatus; favorite: boolean; folderId: string; order: number }>): Promise<QuestionDTO> {
    await ensureFirebaseAuthReady();
    const { collectionName: oldColName, folderId: oldFolderId } = await resolveQuestionLocation(id);
    const ref = doc(folderQuestionsCol(oldColName), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Question not found");

    const isMoving = patch.folderId !== undefined && patch.folderId !== oldFolderId;

    if (isMoving) {
      // Moving to a different folder: copy to new collection, delete from old
      const newColName = await getCollectionName(patch.folderId!);
      const newOrder = patch.order ?? await nextOrder(newColName);
      const data = snap.data() as Record<string, unknown>;
      const updates: Record<string, unknown> = {
        ...data,
        folderId: patch.folderId,
        collectionName: newColName,
        order: newOrder,
        updatedAt: serverTimestamp(),
      };
      if (patch.question !== undefined) { updates.question = patch.question; updates.title = deriveTitle(patch.question); updates.contentHash = await sha256(patch.question); }
      if (patch.answer !== undefined) updates.answer = patch.answer;
      if (patch.tags !== undefined) updates.tags = normalizeTags(patch.tags);
      if (patch.status !== undefined) updates.status = patch.status;
      if (patch.favorite !== undefined) updates.favorite = patch.favorite;

      const db = getClientDb();
      const batch = writeBatch(db);
      batch.set(doc(folderQuestionsCol(newColName), id), updates);
      batch.delete(ref);
      batch.set(doc(qindexCol(), id), { collectionName: newColName, folderId: patch.folderId });
      batch.set(doc(foldersCol(), oldFolderId), { questionCount: increment(-1), updatedAt: serverTimestamp() }, { merge: true });
      batch.set(doc(foldersCol(), patch.folderId!), { questionCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      const updated = await getDoc(doc(folderQuestionsCol(newColName), id));
      return snapToQuestion(updated);
    }

    // Same folder — simple update
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.question !== undefined) { updates.question = patch.question; updates.title = deriveTitle(patch.question); updates.contentHash = await sha256(patch.question); }
    if (patch.answer !== undefined) updates.answer = patch.answer;
    if (patch.tags !== undefined) updates.tags = normalizeTags(patch.tags);
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.favorite !== undefined) updates.favorite = patch.favorite;
    if (patch.order !== undefined) updates.order = patch.order;
    await updateDoc(ref, updates);
    const updated = await getDoc(ref);
    return snapToQuestion(updated);
  },

  async setStatus(id: string, status: QuestionStatus): Promise<QuestionDTO> {
    return questionsApi.update(id, { status });
  },

  async setFavorite(id: string, favorite: boolean): Promise<QuestionDTO> {
    return questionsApi.update(id, { favorite });
  },

  async remove(id: string): Promise<{ ok: true }> {
    await ensureFirebaseAuthReady();
    const { collectionName, folderId } = await resolveQuestionLocation(id);
    const db = getClientDb();
    const batch = writeBatch(db);
    batch.delete(doc(folderQuestionsCol(collectionName), id));
    batch.delete(doc(qindexCol(), id));
    batch.set(doc(foldersCol(), folderId), { questionCount: increment(-1), updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
    return { ok: true };
  },

  async bulkCreate(input: { folderId: string; pairs: { question: string; answer: string }[]; tags?: string[]; status?: QuestionStatus; createdBy?: { id: string; name: string; email: string } | null }): Promise<{ insertedCount: number; firstOrder: number; lastOrder: number }> {
    await ensureFirebaseAuthReady();
    const colName = await getCollectionName(input.folderId);
    const startOrder = await nextOrder(colName);
    const tags = normalizeTags(input.tags);
    const status = input.status ?? "not_studied";
    const db = getClientDb();
    const BATCH_SIZE = 490;
    let batch = writeBatch(db);
    let ops = 0;

    for (let i = 0; i < input.pairs.length; i++) {
      const p = input.pairs[i];
      const qRef = doc(folderQuestionsCol(colName));
      const hash = await sha256(p.question);
      batch.set(qRef, {
        folderId: input.folderId, collectionName: colName,
        order: startOrder + i * ORDER_GAP,
        question: p.question, answer: p.answer ?? "",
        title: deriveTitle(p.question), tags, status,
        favorite: false, contentHash: hash,
        createdBy: input.createdBy ?? null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      // Write index entry in same batch
      batch.set(doc(qindexCol(), qRef.id), { collectionName: colName, folderId: input.folderId });
      ops += 2;
      if (ops >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    await setDoc(doc(foldersCol(), input.folderId), {
      questionCount: increment(input.pairs.length), updatedAt: serverTimestamp(),
    }, { merge: true });

    return {
      insertedCount: input.pairs.length,
      firstOrder: startOrder,
      lastOrder: startOrder + (input.pairs.length - 1) * ORDER_GAP,
    };
  },

  async checkDuplicates(questions: string[], folderId?: string): Promise<{ duplicates: DuplicateMatch[] }> {
    const hashes = await Promise.all(questions.map(q => sha256(q)));
    const uniqueHashes = Array.from(new Set(hashes.filter(Boolean)));
    if (uniqueHashes.length === 0) return { duplicates: [] };

    const existingDocs: QueryDocumentSnapshot[] = [];

    if (folderId) {
      const colName = await getCollectionName(folderId);
      const snap = await getDocs(query(folderQuestionsCol(colName) as Query<DocumentData>, where("contentHash", "in", uniqueHashes.slice(0, 30))));
      existingDocs.push(...snap.docs as QueryDocumentSnapshot[]);
    } else {
      // Search across all folder collections
      const allFolders = await getDocs(foldersCol());
      for (const fd of allFolders.docs) {
        const cn = (fd.data() as Record<string, unknown>).collectionName as string;
        if (!cn) continue;
        for (let i = 0; i < uniqueHashes.length; i += 30) {
          const chunk = uniqueHashes.slice(i, i + 30);
          const snap = await getDocs(query(folderQuestionsCol(cn) as Query<DocumentData>, where("contentHash", "in", chunk)));
          existingDocs.push(...snap.docs as QueryDocumentSnapshot[]);
        }
      }
    }

    const byHash = new Map<string, { _id: string; title: string; folderId: string }[]>();
    for (const d of existingDocs) {
      const data = d.data() as Record<string, unknown>;
      const h = data.contentHash as string;
      const list = byHash.get(h) ?? [];
      list.push({ _id: d.id, title: (data.title as string) ?? "", folderId: data.folderId as string });
      byHash.set(h, list);
    }

    const result: DuplicateMatch[] = [];
    hashes.forEach((h, index) => { const matches = byHash.get(h); if (matches?.length) result.push({ index, matches }); });
    return { duplicates: result };
  },
};

// ─── renderApi — stays as HTTP (server-only shiki pipeline) ──────────────────

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { const b = await res.json(); if (b?.error) message = b.error; } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const renderApi = {
  many: (sources: string[]) =>
    request<{ html: string[] }>("/api/render", { method: "POST", body: JSON.stringify({ sources }) }),
};

// ─── migrationApi — one-time migration from flat `questions` collection ────────
//
// Reads every document in the legacy `questions` collection, resolves its
// target folder-named Firestore collection via the `folderId` field, then
// writes the document into that collection (same doc ID) plus a `_qindex`
// entry.  Documents that are already in `_qindex` are skipped so the
// migration is idempotent — safe to run multiple times.

export type MigrationProgress = {
  total: number;
  done: number;
  migrated: number;
  skipped: number;
  errors: number;
};

export const migrationApi = {
  async run(
    createdBy: { id: string; name: string; email: string } | null,
    onProgress?: (p: MigrationProgress) => void
  ): Promise<MigrationProgress> {
    await ensureFirebaseAuthReady();
    const db = getClientDb();

    // Load all documents from the legacy flat `questions` collection.
    const legacySnap = await getDocs(collection(db, "questions"));
    const total = legacySnap.docs.length;
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Cache folderId → collectionName so we don't re-fetch the same folder.
    const folderColCache = new Map<string, string | null>();

    const report = () =>
      onProgress?.({ total, done: migrated + skipped + errors, migrated, skipped, errors });

    for (const qDoc of legacySnap.docs) {
      const data = qDoc.data() as Record<string, unknown>;
      const folderId = data.folderId as string | undefined;

      // Skip docs with no folderId.
      if (!folderId) { skipped++; report(); continue; }

      // Skip if already migrated (exists in _qindex).
      try {
        const indexSnap = await getDoc(doc(qindexCol(), qDoc.id));
        if (indexSnap.exists()) { skipped++; report(); continue; }
      } catch { /* treat as not indexed — continue */ }

      // Resolve (or derive) the target collection name for this folder.
      if (!folderColCache.has(folderId)) {
        try {
          const folderSnap = await getDoc(doc(foldersCol(), folderId));
          if (!folderSnap.exists()) {
            folderColCache.set(folderId, null);
          } else {
            const fd = folderSnap.data() as Record<string, unknown>;
            let colName = fd.collectionName as string | undefined;

            // ── Key fix: old folders have no collectionName field. ────────────
            // Derive it from the folder's display name, patch the folder doc,
            // and create the _meta placeholder so the collection appears in the
            // Firebase console right away.
            if (!colName && fd.name) {
              colName = slug(fd.name as string);

              // Patch the folder document so future calls know the collection.
              await updateDoc(doc(foldersCol(), folderId), {
                collectionName: colName,
                updatedAt: serverTimestamp(),
              });

              // Create the _meta doc → makes the collection visible in console.
              await setDoc(doc(db, colName, "_meta"), {
                isFolder: true,
                name: fd.name,
                folderId,
                parentId: fd.parentId ?? null,
                createdAt: serverTimestamp(),
              });
            }

            folderColCache.set(folderId, colName ?? null);
          }
        } catch {
          folderColCache.set(folderId, null);
        }
      }

      const colName = folderColCache.get(folderId);
      if (!colName) { skipped++; report(); continue; }

      // Write into the folder-named collection (same document ID) + _qindex.
      try {
        const batch = writeBatch(db);
        batch.set(doc(folderQuestionsCol(colName), qDoc.id), {
          ...data,
          collectionName: colName,
          createdBy: createdBy ?? null,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(qindexCol(), qDoc.id), { collectionName: colName, folderId });
        await batch.commit();
        migrated++;
      } catch {
        errors++;
      }

      report();
    }

    return { total, done: migrated + skipped + errors, migrated, skipped, errors };
  },
};


