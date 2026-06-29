"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
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
import { getClientDb } from "@/firebase-services/client";
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

function foldersCol() {
  return collection(getClientDb(), "folders");
}
function questionsCol() {
  return collection(getClientDb(), "questions");
}

/** Browser-compatible SHA-256 using Web Crypto API. */
async function sha256(text: string): Promise<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function deriveTitle(question: string): string {
  const firstLine =
    question
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("```")) ?? "";
  return firstLine.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").slice(0, 120);
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  return Array.from(new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean)));
}

// ─── Serialization ───────────────────────────────────────────────────────────

function snapToFolder(snap: DocumentSnapshot | QueryDocumentSnapshot): FolderDTO {
  const d = snap.data() as Record<string, unknown>;
  const ts = (f: unknown) =>
    f && typeof (f as { toDate?: () => Date }).toDate === "function"
      ? (f as { toDate: () => Date }).toDate().toISOString()
      : new Date().toISOString();
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
  };
}

function snapToQuestion(snap: DocumentSnapshot | QueryDocumentSnapshot): QuestionDTO {
  const d = snap.data() as Record<string, unknown>;
  const ts = (f: unknown) =>
    f && typeof (f as { toDate?: () => Date }).toDate === "function"
      ? (f as { toDate: () => Date }).toDate().toISOString()
      : new Date().toISOString();
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
  const ts = (f: unknown) =>
    f && typeof (f as { toDate?: () => Date }).toDate === "function"
      ? (f as { toDate: () => Date }).toDate().toISOString()
      : new Date().toISOString();
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

// ─── Cursor encoding ─────────────────────────────────────────────────────────

function encodeCursor(order: number, id: string): string {
  return btoa(`${order}:${id}`);
}
function decodeCursor(raw: string): { order: number; id: string } | null {
  try {
    const [order, id] = atob(raw).split(":");
    if (!order || !id) return null;
    return { order: Number(order), id };
  } catch {
    return null;
  }
}

// ─── Folder tree builder ─────────────────────────────────────────────────────

function buildTree(dtos: FolderDTO[]): FolderTreeNode[] {
  const byId = new Map<string, FolderTreeNode>();
  for (const dto of dtos) byId.set(dto._id, { ...dto, children: [] });
  const roots: FolderTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// ─── foldersApi ──────────────────────────────────────────────────────────────

export const foldersApi = {
  async tree(): Promise<FolderTreeNode[]> {
    const snap = await getDocs(query(foldersCol(), orderBy("path")));
    const dtos = snap.docs.map(snapToFolder);
    return buildTree(dtos);
  },

  async create(name: string, parentId: string | null): Promise<FolderDTO> {
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

    const seg = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
    const path = parentPath && parentPath !== "/" ? `${parentPath}/${seg}` : `/${seg}`;

    const ref = await addDoc(foldersCol(), {
      name, parentId: parentId ?? null, ancestors, depth, path,
      questionCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    const created = await getDoc(ref);
    return snapToFolder(created);
  },

  async rename(id: string, name: string): Promise<FolderDTO> {
    const ref = doc(foldersCol(), id);
    await updateDoc(ref, { name, updatedAt: serverTimestamp() });
    const updated = await getDoc(ref);
    return snapToFolder(updated);
  },

  async move(id: string, newParentId: string | null): Promise<FolderDTO> {
    const db = getClientDb();
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

    const seg = (data.name as string).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
    const newPath = newParentPath && newParentPath !== "/" ? `${newParentPath}/${seg}` : `/${seg}`;

    await updateDoc(ref, {
      parentId: newParentId ?? null, ancestors: newAncestors,
      depth: newDepth, path: newPath, updatedAt: serverTimestamp(),
    });
    const updated = await getDoc(ref);
    return snapToFolder(updated);
  },

  async remove(id: string, cascade: boolean): Promise<{ deletedFolders: number; deletedQuestions: number }> {
    const db = getClientDb();
    const descSnap = await getDocs(query(foldersCol(), where("ancestors", "array-contains", id)));
    const folderIds = [id, ...descSnap.docs.map((d) => d.id)];
    const hasChildren = folderIds.length > 1;

    // Count questions
    let questionCount = 0;
    for (let i = 0; i < folderIds.length; i += 30) {
      const chunk = folderIds.slice(i, i + 30);
      const qSnap = await getDocs(query(questionsCol(), where("folderId", "in", chunk)));
      questionCount += qSnap.size;
    }
    if (!cascade && (hasChildren || questionCount > 0)) {
      throw new Error("Folder is not empty. Cascade delete required.");
    }

    let deletedQuestions = 0;
    for (let i = 0; i < folderIds.length; i += 30) {
      const chunk = folderIds.slice(i, i + 30);
      const qSnap = await getDocs(query(questionsCol(), where("folderId", "in", chunk)));
      let batch = writeBatch(db);
      let ops = 0;
      for (const qDoc of qSnap.docs) {
        batch.delete(qDoc.ref); deletedQuestions++; ops++;
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

const ORDER_GAP = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

async function nextOrder(folderId: string): Promise<number> {
  const snap = await getDocs(
    query(questionsCol(), where("folderId", "==", folderId), orderBy("order", "desc"), limit(1))
  );
  if (snap.empty) return ORDER_GAP;
  return (snap.docs[0].data() as Record<string, unknown>).order as number + ORDER_GAP;
}

async function resolveFolderIds(folderId: string, subtree: boolean): Promise<string[]> {
  if (!subtree) return [folderId];
  const snap = await getDocs(query(foldersCol(), where("ancestors", "array-contains", folderId)));
  return [folderId, ...snap.docs.map((d) => d.id)];
}

export const questionsApi = {
  async list(filters: QuestionListFilters): Promise<PaginatedQuestions> {
    const lim = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    let folderIds: string[] | null = null;
    if (filters.folderId) {
      folderIds = await resolveFolderIds(filters.folderId, Boolean(filters.subtree));
    }

    // Text search — client-side filter on up to 500 docs
    if (filters.q?.trim()) {
      const term = filters.q.trim().toLowerCase();
      let q: Query<DocumentData> = questionsCol() as Query<DocumentData>;
      if (folderIds?.length === 1) q = query(q, where("folderId", "==", folderIds[0])) as Query<DocumentData>;
      if (filters.status) q = query(q, where("status", "==", filters.status)) as Query<DocumentData>;
      q = query(q, orderBy("order"), limit(500)) as Query<DocumentData>;
      const snap = await getDocs(q);
      const skip = filters.cursor ? Number(filters.cursor) || 0 : 0;
      const matched = snap.docs.filter((d) => {
        const data = d.data() as Record<string, unknown>;
        return (
          (data.title as string)?.toLowerCase().includes(term) ||
          (data.question as string)?.toLowerCase().includes(term) ||
          ((data.tags as string[]) ?? []).some((t) => t.includes(term))
        );
      });
      const page = matched.slice(skip, skip + lim + 1);
      const hasMore = page.length > lim;
      return {
        items: (hasMore ? page.slice(0, lim) : page).map(snapToListItem),
        nextCursor: hasMore ? String(skip + lim) : null,
        total: null,
      };
    }

    // Multi-folder fetch
    if (folderIds && folderIds.length > 1) {
      const allDocs: QueryDocumentSnapshot[] = [];
      for (let i = 0; i < folderIds.length; i += 30) {
        const chunk = folderIds.slice(i, i + 30);
        let q: Query<DocumentData> = query(questionsCol() as Query<DocumentData>, where("folderId", "in", chunk), orderBy("order"));
        if (filters.status) q = query(q, where("status", "==", filters.status)) as Query<DocumentData>;
        const snap = await getDocs(q);
        allDocs.push(...snap.docs as QueryDocumentSnapshot[]);
      }
      allDocs.sort((a, b) => {
        const ao = (a.data() as Record<string, unknown>).order as number;
        const bo = (b.data() as Record<string, unknown>).order as number;
        return ao - bo || a.id.localeCompare(b.id);
      });
      let startIdx = 0;
      if (filters.cursor) {
        const c = decodeCursor(filters.cursor);
        if (c) {
          startIdx = allDocs.findIndex((d) => {
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
        nextCursor: hasMore && last
          ? encodeCursor((last.data() as Record<string, unknown>).order as number, last.id)
          : null,
        total: null,
      };
    }

    // Single folder or no filter — native cursor pagination
    let q: Query<DocumentData> = questionsCol() as Query<DocumentData>;
    if (folderIds?.length === 1) q = query(q, where("folderId", "==", folderIds[0])) as Query<DocumentData>;
    if (filters.status) q = query(q, where("status", "==", filters.status)) as Query<DocumentData>;
    if (typeof filters.favorite === "boolean") q = query(q, where("favorite", "==", filters.favorite)) as Query<DocumentData>;
    if (filters.tags?.length) q = query(q, where("tags", "array-contains", normalizeTags(filters.tags)[0])) as Query<DocumentData>;
    q = query(q, orderBy("order")) as Query<DocumentData>;

    if (filters.cursor) {
      const c = decodeCursor(filters.cursor);
      if (c) {
        const cursorSnap = await getDoc(doc(questionsCol(), c.id));
        if (cursorSnap.exists()) q = query(q, startAfter(cursorSnap)) as Query<DocumentData>;
      }
    }
    q = query(q, limit(lim + 1)) as Query<DocumentData>;
    const snap = await getDocs(q);
    let docs = snap.docs as QueryDocumentSnapshot[];
    if (filters.tags && filters.tags.length > 1) {
      const norm = normalizeTags(filters.tags);
      docs = docs.filter((d) => {
        const tags = ((d.data() as Record<string, unknown>).tags as string[]) ?? [];
        return norm.every((t) => tags.includes(t));
      });
    }
    const hasMore = docs.length > lim;
    const page = hasMore ? docs.slice(0, lim) : docs;
    const last = page[page.length - 1];
    return {
      items: page.map(snapToListItem),
      nextCursor: hasMore && last
        ? encodeCursor((last.data() as Record<string, unknown>).order as number, last.id)
        : null,
      total: null,
    };
  },

  async get(id: string): Promise<QuestionDTO> {
    const snap = await getDoc(doc(questionsCol(), id));
    if (!snap.exists()) throw new Error("Question not found");
    return snapToQuestion(snap);
  },

  async create(input: {
    folderId: string; question: string; answer: string;
    tags?: string[]; status?: QuestionStatus;
  }): Promise<QuestionDTO> {
    const folderSnap = await getDoc(doc(foldersCol(), input.folderId));
    if (!folderSnap.exists()) throw new Error("Folder not found");
    const order = await nextOrder(input.folderId);
    const hash = await sha256(input.question);
    const ref = await addDoc(questionsCol(), {
      folderId: input.folderId, order,
      question: input.question, answer: input.answer ?? "",
      title: deriveTitle(input.question),
      tags: normalizeTags(input.tags),
      status: input.status ?? "not_studied",
      favorite: false, contentHash: hash,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(foldersCol(), input.folderId), {
      questionCount: increment(1), updatedAt: serverTimestamp(),
    });
    const created = await getDoc(ref);
    return snapToQuestion(created);
  },

  async update(id: string, patch: Partial<{
    question: string; answer: string; tags: string[];
    status: QuestionStatus; favorite: boolean; folderId: string; order: number;
  }>): Promise<QuestionDTO> {
    const ref = doc(questionsCol(), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Question not found");
    const data = snap.data() as Record<string, unknown>;
    const oldFolderId = data.folderId as string;
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.question !== undefined) {
      updates.question = patch.question;
      updates.title = deriveTitle(patch.question);
      updates.contentHash = await sha256(patch.question);
    }
    if (patch.answer !== undefined) updates.answer = patch.answer;
    if (patch.tags !== undefined) updates.tags = normalizeTags(patch.tags);
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.favorite !== undefined) updates.favorite = patch.favorite;
    if (patch.order !== undefined) updates.order = patch.order;
    const isMoving = patch.folderId !== undefined && patch.folderId !== oldFolderId;
    if (isMoving) {
      const nf = await getDoc(doc(foldersCol(), patch.folderId!));
      if (!nf.exists()) throw new Error("Destination folder not found");
      updates.folderId = patch.folderId;
      if (patch.order === undefined) updates.order = await nextOrder(patch.folderId!);
    }
    await updateDoc(ref, updates);
    if (isMoving) {
      await updateDoc(doc(foldersCol(), oldFolderId), { questionCount: increment(-1), updatedAt: serverTimestamp() });
      await updateDoc(doc(foldersCol(), patch.folderId!), { questionCount: increment(1), updatedAt: serverTimestamp() });
    }
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
    const snap = await getDoc(doc(questionsCol(), id));
    if (!snap.exists()) throw new Error("Question not found");
    const folderId = (snap.data() as Record<string, unknown>).folderId as string;
    await deleteDoc(doc(questionsCol(), id));
    await updateDoc(doc(foldersCol(), folderId), {
      questionCount: increment(-1), updatedAt: serverTimestamp(),
    });
    return { ok: true };
  },

  async bulkCreate(input: {
    folderId: string; pairs: { question: string; answer: string }[];
    tags?: string[]; status?: QuestionStatus;
    createdBy?: { id: string; name: string; email: string } | null;
  }): Promise<{ insertedCount: number; firstOrder: number; lastOrder: number }> {
    const folderSnap = await getDoc(doc(foldersCol(), input.folderId));
    if (!folderSnap.exists()) throw new Error("Folder not found");
    const startOrder = await nextOrder(input.folderId);
    const tags = normalizeTags(input.tags);
    const status = input.status ?? "not_studied";
    const db = getClientDb();
    const BATCH_SIZE = 499;
    let batch = writeBatch(db);
    let ops = 0;
    for (let i = 0; i < input.pairs.length; i++) {
      const p = input.pairs[i];
      const ref = doc(questionsCol()); // auto-id
      const hash = await sha256(p.question);
      batch.set(ref, {
        folderId: input.folderId, order: startOrder + i * ORDER_GAP,
        question: p.question, answer: p.answer ?? "",
        title: deriveTitle(p.question), tags, status,
        favorite: false, contentHash: hash,
        createdBy: input.createdBy ?? null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      ops++;
      if (ops >= BATCH_SIZE) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();
    await updateDoc(doc(foldersCol(), input.folderId), {
      questionCount: increment(input.pairs.length), updatedAt: serverTimestamp(),
    });
    return {
      insertedCount: input.pairs.length,
      firstOrder: startOrder,
      lastOrder: startOrder + (input.pairs.length - 1) * ORDER_GAP,
    };
  },

  async checkDuplicates(
    questions: string[],
    folderId?: string
  ): Promise<{ duplicates: DuplicateMatch[] }> {
    const hashes = await Promise.all(questions.map((q) => sha256(q)));
    const uniqueHashes = Array.from(new Set(hashes.filter(Boolean)));
    if (uniqueHashes.length === 0) return { duplicates: [] };

    const existingDocs: QueryDocumentSnapshot[] = [];
    for (let i = 0; i < uniqueHashes.length; i += 30) {
      const chunk = uniqueHashes.slice(i, i + 30);
      let q: Query<DocumentData> = query(questionsCol() as Query<DocumentData>, where("contentHash", "in", chunk));
      if (folderId) q = query(q, where("folderId", "==", folderId)) as Query<DocumentData>;
      const snap = await getDocs(q);
      existingDocs.push(...snap.docs as QueryDocumentSnapshot[]);
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
    hashes.forEach((h, index) => {
      const matches = byHash.get(h);
      if (matches?.length) result.push({ index, matches });
    });
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
    request<{ html: string[] }>("/api/render", {
      method: "POST",
      body: JSON.stringify({ sources }),
    }),
};
