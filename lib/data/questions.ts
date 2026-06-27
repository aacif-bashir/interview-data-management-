/**
 * Question data-access layer — Firestore implementation.
 *
 * Firestore data model
 * ────────────────────
 * Collection : "questions"
 * Document id: auto-generated Firestore doc id (used as _id in DTOs)
 *
 * Fields stored per question:
 *   folderId      string
 *   order         number               – gap-spaced (1000, 2000, …)
 *   question      string               – raw Markdown
 *   answer        string               – raw Markdown
 *   title         string               – first ~120 chars of question
 *   tags          string[]
 *   status        "not_studied" | "learning" | "mastered"
 *   favorite      boolean
 *   contentHash   string               – sha256 for dedup
 *   createdAt     Timestamp
 *   updatedAt     Timestamp
 *
 * Composite indexes required in Firestore:
 *   - questions / folderId ASC, order ASC
 *   - questions / folderId ASC, status ASC, order ASC
 *   - questions / favorite ASC, updatedAt DESC
 *   - questions / contentHash ASC
 *   - questions / createdAt DESC
 */

import { FieldValue, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { contentHash } from "@/lib/hash";
import { notFound } from "./errors";
import type {
  QuestionDTO,
  QuestionListFilters,
  PaginatedQuestions,
  QuestionListItem,
  DuplicateMatch,
} from "@/types";

// ─── Collection reference ────────────────────────────────────────────────────

const COL = "questions";
const FOLDERS_COL = "folders";

function questionsCol() {
  return getDb().collection(COL);
}
function foldersCol() {
  return getDb().collection(FOLDERS_COL);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ORDER_GAP = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ─── Internal document shape ─────────────────────────────────────────────────

interface QuestionDoc {
  folderId: string;
  order: number;
  question: string;
  answer: string;
  title: string;
  tags: string[];
  status: QuestionDTO["status"];
  favorite: boolean;
  contentHash: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ─── Serialization ───────────────────────────────────────────────────────────

function docToDTO(snap: DocumentSnapshot | QueryDocumentSnapshot): QuestionDTO {
  const d = snap.data() as QuestionDoc;
  return {
    _id: snap.id,
    folderId: d.folderId,
    title: d.title ?? "",
    question: d.question,
    answer: d.answer ?? "",
    status: d.status,
    favorite: d.favorite,
    tags: d.tags ?? [],
    order: d.order,
    createdAt: d.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    updatedAt: d.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

function docToListItem(
  snap: DocumentSnapshot | QueryDocumentSnapshot
): QuestionListItem {
  const d = snap.data() as QuestionDoc;
  return {
    _id: snap.id,
    folderId: d.folderId,
    title: d.title ?? "",
    status: d.status,
    favorite: d.favorite,
    tags: d.tags ?? [],
    order: d.order,
    createdAt: d.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    updatedAt: d.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveTitle(question: string): string {
  const firstLine =
    question
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("```")) ?? "";
  const cleaned = firstLine.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "");
  return cleaned.slice(0, 120);
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  return Array.from(
    new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean))
  );
}

// ─── Cursor encoding (order:id base64url) ────────────────────────────────────

interface Cursor {
  order: number;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.order}:${c.id}`).toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const [order, id] = Buffer.from(raw, "base64url").toString("utf8").split(":");
    if (!order || !id) return null;
    return { order: Number(order), id };
  } catch {
    return null;
  }
}

/** Resolve all folder ids for a (folderId, subtree) filter pair. */
async function resolveFolderIds(
  folderId: string,
  subtree: boolean
): Promise<string[]> {
  if (!subtree) return [folderId];
  const descendants = await foldersCol()
    .where("ancestors", "array-contains", folderId)
    .get();
  return [folderId, ...descendants.docs.map((d) => d.id)];
}

/** Next order value within a folder (max existing + gap). */
async function nextOrder(folderId: string): Promise<number> {
  const snap = await questionsCol()
    .where("folderId", "==", folderId)
    .orderBy("order", "desc")
    .limit(1)
    .get();
  if (snap.empty) return ORDER_GAP;
  return (snap.docs[0].data() as QuestionDoc).order + ORDER_GAP;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List questions with filtering and cursor pagination.
 *
 * Note: Firestore does NOT support full-text search natively. When `q` is
 * supplied we do a client-side title/tag prefix check on the first 500 docs
 * that match the other filters. For production at scale, integrate Algolia or
 * Typesense and replace the text-search branch below.
 */
export async function listQuestions(
  filters: QuestionListFilters
): Promise<PaginatedQuestions> {
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Resolve folder ids.
  let folderIds: string[] | null = null;
  if (filters.folderId) {
    folderIds = await resolveFolderIds(
      filters.folderId,
      Boolean(filters.subtree)
    );
  }

  // ── Text search branch (client-side filter on a capped result set) ──────
  if (filters.q && filters.q.trim()) {
    const term = filters.q.trim().toLowerCase();

    let query: FirebaseFirestore.Query = questionsCol();

    // Apply folder filter (Firestore `in` limited to 30 items).
    if (folderIds) {
      if (folderIds.length === 1) {
        query = query.where("folderId", "==", folderIds[0]);
      } else {
        // Firestore `in` max = 30. Fetch in chunks and merge client-side.
        const CHUNK = 30;
        const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        for (let i = 0; i < folderIds.length; i += CHUNK) {
          const chunk = folderIds.slice(i, i + CHUNK);
          const snap = await questionsCol()
            .where("folderId", "in", chunk)
            .orderBy("order")
            .get();
          allDocs.push(...snap.docs);
        }
        // Client-side text filter.
        const matched = allDocs.filter((d) => {
          const data = d.data() as QuestionDoc;
          return (
            data.title?.toLowerCase().includes(term) ||
            data.tags?.some((t) => t.includes(term)) ||
            data.question?.toLowerCase().includes(term)
          );
        });
        const skip = filters.cursor ? Number(filters.cursor) || 0 : 0;
        const page = matched.slice(skip, skip + limit + 1);
        const hasMore = page.length > limit;
        return {
          items: (hasMore ? page.slice(0, limit) : page).map(docToListItem),
          nextCursor: hasMore ? String(skip + limit) : null,
          total: null,
        };
      }
    }

    if (filters.status) query = query.where("status", "==", filters.status);
    if (typeof filters.favorite === "boolean") {
      query = query.where("favorite", "==", filters.favorite);
    }
    query = query.orderBy("order").limit(500);

    const snap = await query.get();
    const skip = filters.cursor ? Number(filters.cursor) || 0 : 0;

    const matched = snap.docs.filter((d) => {
      const data = d.data() as QuestionDoc;
      return (
        data.title?.toLowerCase().includes(term) ||
        data.tags?.some((t) => t.includes(term)) ||
        data.question?.toLowerCase().includes(term)
      );
    });

    const page = matched.slice(skip, skip + limit + 1);
    const hasMore = page.length > limit;

    return {
      items: (hasMore ? page.slice(0, limit) : page).map(docToListItem),
      nextCursor: hasMore ? String(skip + limit) : null,
      total: null,
    };
  }

  // ── Ordered (cursor) branch ───────────────────────────────────────────────

  // When filtering on multiple folder ids we must chunk and merge client-side
  // because Firestore `in` is limited to 30 values and doesn't combine well
  // with orderBy on a different field.
  if (folderIds && folderIds.length > 1) {
    const CHUNK = 30;
    const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (let i = 0; i < folderIds.length; i += CHUNK) {
      const chunk = folderIds.slice(i, i + CHUNK);
      let q: FirebaseFirestore.Query = questionsCol()
        .where("folderId", "in", chunk)
        .orderBy("order");
      if (filters.status) q = q.where("status", "==", filters.status);
      if (typeof filters.favorite === "boolean") {
        q = q.where("favorite", "==", filters.favorite);
      }
      const snap = await q.get();
      allDocs.push(...snap.docs);
    }

    // Sort merged result and apply cursor.
    allDocs.sort((a, b) => {
      const ao = (a.data() as QuestionDoc).order;
      const bo = (b.data() as QuestionDoc).order;
      return ao - bo || a.id.localeCompare(b.id);
    });

    let startIdx = 0;
    if (filters.cursor) {
      const c = decodeCursor(filters.cursor);
      if (c) {
        startIdx = allDocs.findIndex((d) => {
          const o = (d.data() as QuestionDoc).order;
          return o > c.order || (o === c.order && d.id > c.id);
        });
        if (startIdx === -1) startIdx = allDocs.length;
      }
    }

    const page = allDocs.slice(startIdx, startIdx + limit + 1);
    const hasMore = page.length > limit;
    const visible = hasMore ? page.slice(0, limit) : page;
    const last = visible[visible.length - 1];

    return {
      items: visible.map(docToListItem),
      nextCursor:
        hasMore && last
          ? encodeCursor({ order: (last.data() as QuestionDoc).order, id: last.id })
          : null,
      total: null,
    };
  }

  // ── Single folder (or no folder filter) — native Firestore pagination ─────

  const hasDateFilter = Boolean(filters.dateFrom || filters.dateTo);

  let query: FirebaseFirestore.Query = questionsCol();
  if (folderIds && folderIds.length === 1) {
    query = query.where("folderId", "==", folderIds[0]);
  }
  if (filters.status) query = query.where("status", "==", filters.status);
  if (typeof filters.favorite === "boolean") {
    query = query.where("favorite", "==", filters.favorite);
  }
  if (filters.tags && filters.tags.length > 0) {
    // Firestore array-contains-any supports up to 30 values; we use
    // array-contains for the first tag and post-filter for the rest.
    query = query.where("tags", "array-contains", normalizeTags(filters.tags)[0]);
  }
  if (filters.dateFrom) {
    query = query.where("createdAt", ">=", new Date(filters.dateFrom));
  }
  if (filters.dateTo) {
    query = query.where("createdAt", "<=", new Date(filters.dateTo));
  }

  if (hasDateFilter) {
    // Firestore rule: the first orderBy must match the inequality filter field.
    // Sort by createdAt here; we re-sort by `order` client-side after fetching.
    query = query.orderBy("createdAt");

    // Offset-based cursor for date-filtered pages (order-based cursor invalid here).
    const skip = filters.cursor ? Number(filters.cursor) || 0 : 0;
    query = query.limit(skip + limit + 1);

    const snap = await query.get();
    let docs = snap.docs.slice(skip);

    // Post-filter for additional tags (beyond the first).
    if (filters.tags && filters.tags.length > 1) {
      const normalized = normalizeTags(filters.tags);
      docs = docs.filter((d) => {
        const dt = (d.data() as QuestionDoc).tags ?? [];
        return normalized.every((t) => dt.includes(t));
      });
    }

    // Re-sort by order ascending (client-side).
    docs.sort((a, b) => (a.data() as QuestionDoc).order - (b.data() as QuestionDoc).order);

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;

    return {
      items: page.map(docToListItem),
      nextCursor: hasMore ? String(skip + limit) : null,
      total: null,
    };
  }

  // No date filter — order by `order` for stable cursor pagination.
  query = query.orderBy("order");

  // Apply cursor.
  if (filters.cursor) {
    const c = decodeCursor(filters.cursor);
    if (c) {
      const cursorDoc = await questionsCol().doc(c.id).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
  }

  query = query.limit(limit + 1);
  const snap = await query.get();

  // Post-filter for additional tags (beyond the first).
  let docs = snap.docs;
  if (filters.tags && filters.tags.length > 1) {
    const normalized = normalizeTags(filters.tags);
    docs = docs.filter((d) => {
      const dt = (d.data() as QuestionDoc).tags ?? [];
      return normalized.every((t) => dt.includes(t));
    });
  }

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const last = page[page.length - 1];

  return {
    items: page.map(docToListItem),
    nextCursor:
      hasMore && last
        ? encodeCursor({ order: (last.data() as QuestionDoc).order, id: last.id })
        : null,
    total: null,
  };
}

export async function getQuestion(id: string): Promise<QuestionDTO> {
  const snap = await questionsCol().doc(id).get();
  if (!snap.exists) throw notFound("Question");
  return docToDTO(snap);
}

export async function createQuestion(input: {
  folderId: string;
  question: string;
  answer: string;
  tags?: string[];
  status?: QuestionDTO["status"];
}): Promise<QuestionDTO> {
  // Validate folder exists.
  const folderSnap = await foldersCol().doc(input.folderId).get();
  if (!folderSnap.exists) throw notFound("Folder");

  const order = await nextOrder(input.folderId);
  const now = FieldValue.serverTimestamp();

  const ref = await questionsCol().add({
    folderId: input.folderId,
    order,
    question: input.question,
    answer: input.answer ?? "",
    title: deriveTitle(input.question),
    tags: normalizeTags(input.tags),
    status: input.status ?? "not_studied",
    favorite: false,
    contentHash: contentHash(input.question),
    createdAt: now,
    updatedAt: now,
  });

  // Increment folder question count.
  await foldersCol()
    .doc(input.folderId)
    .update({ questionCount: FieldValue.increment(1), updatedAt: now });

  const created = await ref.get();
  return docToDTO(created);
}

/**
 * Bulk-insert N ordered questions into a folder in a single Firestore batch.
 */
export async function bulkCreateQuestions(input: {
  folderId: string;
  pairs: { question: string; answer: string }[];
  tags?: string[];
  status?: QuestionDTO["status"];
}): Promise<{ insertedCount: number; firstOrder: number; lastOrder: number }> {
  const folderSnap = await foldersCol().doc(input.folderId).get();
  if (!folderSnap.exists) throw notFound("Folder");

  const startOrder = await nextOrder(input.folderId);
  const tags = normalizeTags(input.tags);
  const status = input.status ?? "not_studied";
  const now = FieldValue.serverTimestamp();
  const db = getDb();

  // Firestore batch limit is 500 writes.
  const BATCH_SIZE = 499;
  let batch = db.batch();
  let opCount = 0;

  const pairs = input.pairs;

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const ref = questionsCol().doc(); // auto-id
    batch.set(ref, {
      folderId: input.folderId,
      order: startOrder + i * ORDER_GAP,
      question: p.question,
      answer: p.answer ?? "",
      title: deriveTitle(p.question),
      tags,
      status,
      favorite: false,
      contentHash: contentHash(p.question),
      createdAt: now,
      updatedAt: now,
    });
    opCount++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();

  // Update folder question count.
  await foldersCol()
    .doc(input.folderId)
    .update({
      questionCount: FieldValue.increment(pairs.length),
      updatedAt: now,
    });

  return {
    insertedCount: pairs.length,
    firstOrder: startOrder,
    lastOrder: startOrder + (pairs.length - 1) * ORDER_GAP,
  };
}

export async function updateQuestion(
  id: string,
  patch: {
    question?: string;
    answer?: string;
    tags?: string[];
    status?: QuestionDTO["status"];
    favorite?: boolean;
    folderId?: string;
    order?: number;
  }
): Promise<QuestionDTO> {
  const snap = await questionsCol().doc(id).get();
  if (!snap.exists) throw notFound("Question");

  const data = snap.data() as QuestionDoc;
  const oldFolderId = data.folderId;
  const now = FieldValue.serverTimestamp();

  const updates: Record<string, unknown> = { updatedAt: now };

  if (patch.question !== undefined) {
    updates.question = patch.question;
    updates.title = deriveTitle(patch.question);
    updates.contentHash = contentHash(patch.question);
  }
  if (patch.answer !== undefined) updates.answer = patch.answer;
  if (patch.tags !== undefined) updates.tags = normalizeTags(patch.tags);
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.favorite !== undefined) updates.favorite = patch.favorite;
  if (patch.order !== undefined) updates.order = patch.order;

  const isMoving =
    patch.folderId !== undefined && patch.folderId !== oldFolderId;

  if (isMoving) {
    const newFolderSnap = await foldersCol().doc(patch.folderId!).get();
    if (!newFolderSnap.exists) throw notFound("Folder");
    updates.folderId = patch.folderId;
    if (patch.order === undefined) {
      updates.order = await nextOrder(patch.folderId!);
    }
  }

  await snap.ref.update(updates);

  // Adjust folder question counts if moved.
  if (isMoving) {
    await foldersCol()
      .doc(oldFolderId)
      .update({ questionCount: FieldValue.increment(-1), updatedAt: now });
    await foldersCol()
      .doc(patch.folderId!)
      .update({ questionCount: FieldValue.increment(1), updatedAt: now });
  }

  const updated = await snap.ref.get();
  return docToDTO(updated);
}

export async function setStatus(
  id: string,
  status: QuestionDTO["status"]
): Promise<QuestionDTO> {
  return updateQuestion(id, { status });
}

export async function setFavorite(
  id: string,
  favorite: boolean
): Promise<QuestionDTO> {
  return updateQuestion(id, { favorite });
}

export async function deleteQuestion(id: string): Promise<{ ok: true }> {
  const snap = await questionsCol().doc(id).get();
  if (!snap.exists) throw notFound("Question");

  const data = snap.data() as QuestionDoc;
  const now = FieldValue.serverTimestamp();

  await snap.ref.delete();
  await foldersCol()
    .doc(data.folderId)
    .update({ questionCount: FieldValue.increment(-1), updatedAt: now });

  return { ok: true };
}

/**
 * Find duplicates among candidate question strings by content hash.
 * Optionally scoped to a folder.
 */
export async function findDuplicates(
  questions: string[],
  folderId?: string
): Promise<DuplicateMatch[]> {
  const hashes = questions.map((q) => contentHash(q));
  const uniqueHashes = Array.from(new Set(hashes.filter(Boolean)));
  if (uniqueHashes.length === 0) return [];

  // Firestore `in` is limited to 30 values per query.
  const existingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const CHUNK = 30;

  for (let i = 0; i < uniqueHashes.length; i += CHUNK) {
    const chunk = uniqueHashes.slice(i, i + CHUNK);
    let q: FirebaseFirestore.Query = questionsCol().where(
      "contentHash",
      "in",
      chunk
    );
    if (folderId) q = q.where("folderId", "==", folderId);
    const snap = await q.get();
    existingDocs.push(...snap.docs);
  }

  // Group existing docs by hash.
  const byHash = new Map<string, { _id: string; title: string; folderId: string }[]>();
  for (const d of existingDocs) {
    const data = d.data() as QuestionDoc;
    const list = byHash.get(data.contentHash) ?? [];
    list.push({ _id: d.id, title: data.title ?? "", folderId: data.folderId });
    byHash.set(data.contentHash, list);
  }

  const result: DuplicateMatch[] = [];
  hashes.forEach((h, index) => {
    const matches = byHash.get(h);
    if (matches && matches.length) result.push({ index, matches });
  });
  return result;
}
