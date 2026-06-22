import { Types, type FilterQuery } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Folder } from "@/models/Folder";
import { Question, type QuestionDoc } from "@/models/Question";
import { contentHash } from "@/lib/hash";
import { serializeQuestion, serializeListItem } from "./serialize";
import { notFound } from "./errors";
import type {
  QuestionDTO,
  QuestionListFilters,
  PaginatedQuestions,
  DuplicateMatch,
} from "@/types";

const ORDER_GAP = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Derive a short title (~120 chars) from the first non-empty markdown line. */
function deriveTitle(question: string): string {
  const firstLine =
    question
      .split("\n")
      .map((l) => l.trim())
      // skip code fences / empty lines
      .find((l) => l.length > 0 && !l.startsWith("```")) ?? "";
  // Strip a leading markdown heading / list marker for a cleaner title.
  const cleaned = firstLine.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "");
  return cleaned.slice(0, 120);
}

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  return Array.from(
    new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean))
  );
}

// ---- Cursor encoding ----
// Cursor encodes the last (order, _id) so the next page is a range scan on the
// { folderId, order } index — depth-independent for 10k+ docs.

interface Cursor {
  order: number;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.order}:${c.id}`).toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const [order, id] = Buffer.from(raw, "base64url")
      .toString("utf8")
      .split(":");
    if (!order || !id || !Types.ObjectId.isValid(id)) return null;
    return { order: Number(order), id };
  } catch {
    return null;
  }
}

/** Resolve the set of folder ids for a folder filter, optionally including its subtree. */
async function resolveFolderIds(
  folderId: string,
  subtree: boolean
): Promise<Types.ObjectId[]> {
  const root = new Types.ObjectId(folderId);
  if (!subtree) return [root];
  const descendants = await Folder.find({ ancestors: root })
    .select("_id")
    .exec();
  return [root, ...descendants.map((d) => d._id)];
}

/**
 * List questions with filtering + pagination.
 *
 * Two pagination modes:
 *  - Ordered (default): range cursor on { folderId, order } — used whenever the
 *    result set is anchored to a single folder ordering.
 *  - Search ($text): ranked by text score with capped skip/limit (search result
 *    sets are small), since score isn't range-cursorable.
 */
export async function listQuestions(
  filters: QuestionListFilters
): Promise<PaginatedQuestions> {
  await dbConnect();

  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const base: FilterQuery<QuestionDoc> = {};

  if (filters.folderId && Types.ObjectId.isValid(filters.folderId)) {
    const ids = await resolveFolderIds(
      filters.folderId,
      Boolean(filters.subtree)
    );
    base.folderId = ids.length === 1 ? ids[0] : { $in: ids };
  }
  if (filters.status) base.status = filters.status;
  if (typeof filters.favorite === "boolean") base.favorite = filters.favorite;
  if (filters.tags && filters.tags.length) {
    base.tags = { $all: normalizeTags(filters.tags) };
  }
  if (filters.dateFrom || filters.dateTo) {
    base.createdAt = {};
    if (filters.dateFrom) base.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) base.createdAt.$lte = new Date(filters.dateTo);
  }

  const listProjection =
    "folderId title status favorite tags order createdAt updatedAt";

  // --- Text search branch ---
  if (filters.q && filters.q.trim()) {
    const skip = filters.cursor ? Number(filters.cursor) || 0 : 0;
    const query = { ...base, $text: { $search: filters.q.trim() } };
    const docs = await Question.find(query, {
      score: { $meta: "textScore" },
    })
      .select(listProjection)
      .sort({ score: { $meta: "textScore" } })
      .skip(skip)
      .limit(limit + 1)
      .lean<QuestionDoc[]>()
      .exec();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    return {
      items: page.map(serializeListItem),
      nextCursor: hasMore ? String(skip + limit) : null,
      total: null,
    };
  }

  // --- Ordered (range-cursor) branch ---
  const query: FilterQuery<QuestionDoc> = { ...base };
  if (filters.cursor) {
    const c = decodeCursor(filters.cursor);
    if (c) {
      // Range on (order, _id) to break ties deterministically.
      query.$or = [
        { order: { $gt: c.order } },
        { order: c.order, _id: { $gt: new Types.ObjectId(c.id) } },
      ];
    }
  }

  const docs = await Question.find(query)
    .select(listProjection)
    .sort({ order: 1, _id: 1 })
    .limit(limit + 1)
    .lean<QuestionDoc[]>()
    .exec();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const last = page[page.length - 1];

  return {
    items: page.map(serializeListItem),
    nextCursor:
      hasMore && last
        ? encodeCursor({ order: last.order, id: last._id.toString() })
        : null,
    total: null,
  };
}

export async function getQuestion(id: string): Promise<QuestionDTO> {
  await dbConnect();
  if (!Types.ObjectId.isValid(id)) throw notFound("Question");
  const doc = await Question.findById(id).exec();
  if (!doc) throw notFound("Question");
  return serializeQuestion(doc);
}

/** Next order value to append within a folder (max + gap). */
async function nextOrder(folderId: Types.ObjectId): Promise<number> {
  const last = await Question.findOne({ folderId })
    .sort({ order: -1 })
    .select("order")
    .lean<{ order: number }>()
    .exec();
  return (last?.order ?? 0) + ORDER_GAP;
}

export async function createQuestion(input: {
  folderId: string;
  question: string;
  answer: string;
  tags?: string[];
  status?: QuestionDTO["status"];
}): Promise<QuestionDTO> {
  await dbConnect();
  const folderId = new Types.ObjectId(input.folderId);
  // Validate folder exists.
  if (!(await Folder.exists({ _id: folderId }))) throw notFound("Folder");

  const order = await nextOrder(folderId);
  const doc = await Question.create({
    folderId,
    order,
    question: input.question,
    answer: input.answer ?? "",
    title: deriveTitle(input.question),
    tags: normalizeTags(input.tags),
    status: input.status ?? "not_studied",
    contentHash: contentHash(input.question),
  });

  await Folder.updateOne({ _id: folderId }, { $inc: { questionCount: 1 } });
  return serializeQuestion(doc);
}

/**
 * The paste-and-map bulk save. Appends N ordered questions to a folder in a
 * single insertMany, with gap-spaced order values.
 */
export async function bulkCreateQuestions(input: {
  folderId: string;
  pairs: { question: string; answer: string }[];
  tags?: string[];
  status?: QuestionDTO["status"];
}): Promise<{ insertedCount: number; firstOrder: number; lastOrder: number }> {
  await dbConnect();
  const folderId = new Types.ObjectId(input.folderId);
  if (!(await Folder.exists({ _id: folderId }))) throw notFound("Folder");

  const startOrder = await nextOrder(folderId);
  const tags = normalizeTags(input.tags);
  const status = input.status ?? "not_studied";

  const docs = input.pairs.map((p, i) => ({
    folderId,
    order: startOrder + i * ORDER_GAP,
    question: p.question,
    answer: p.answer ?? "",
    title: deriveTitle(p.question),
    tags,
    status,
    contentHash: contentHash(p.question),
  }));

  const inserted = await Question.insertMany(docs);
  await Folder.updateOne(
    { _id: folderId },
    { $inc: { questionCount: inserted.length } }
  );

  return {
    insertedCount: inserted.length,
    firstOrder: startOrder,
    lastOrder: startOrder + (inserted.length - 1) * ORDER_GAP,
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
  await dbConnect();
  if (!Types.ObjectId.isValid(id)) throw notFound("Question");
  const doc = await Question.findById(id).exec();
  if (!doc) throw notFound("Question");

  const oldFolderId = doc.folderId.toString();

  if (patch.question !== undefined) {
    doc.question = patch.question;
    doc.title = deriveTitle(patch.question);
    doc.contentHash = contentHash(patch.question);
  }
  if (patch.answer !== undefined) doc.answer = patch.answer;
  if (patch.tags !== undefined) doc.tags = normalizeTags(patch.tags);
  if (patch.status !== undefined) doc.status = patch.status;
  if (patch.favorite !== undefined) doc.favorite = patch.favorite;
  if (patch.order !== undefined) doc.order = patch.order;

  if (patch.folderId !== undefined && patch.folderId !== oldFolderId) {
    const newFolderId = new Types.ObjectId(patch.folderId);
    if (!(await Folder.exists({ _id: newFolderId }))) throw notFound("Folder");
    doc.folderId = newFolderId;
    // Append to the end of the destination folder if order not explicitly set.
    if (patch.order === undefined) doc.order = await nextOrder(newFolderId);
  }

  await doc.save();

  // Keep folder counts accurate if the question moved.
  if (patch.folderId !== undefined && patch.folderId !== oldFolderId) {
    await Folder.updateOne(
      { _id: new Types.ObjectId(oldFolderId) },
      { $inc: { questionCount: -1 } }
    );
    await Folder.updateOne(
      { _id: doc.folderId },
      { $inc: { questionCount: 1 } }
    );
  }

  return serializeQuestion(doc);
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
  await dbConnect();
  if (!Types.ObjectId.isValid(id)) throw notFound("Question");
  const doc = await Question.findByIdAndDelete(id).exec();
  if (!doc) throw notFound("Question");
  await Folder.updateOne(
    { _id: doc.folderId },
    { $inc: { questionCount: -1 } }
  );
  return { ok: true };
}

/**
 * Given a list of (candidate) question strings, return which ones already
 * exist — matched by normalized content hash. Optionally scope to a folder.
 * Used by the paste preview to warn about duplicates before saving.
 */
export async function findDuplicates(
  questions: string[],
  folderId?: string
): Promise<DuplicateMatch[]> {
  await dbConnect();

  // Hash every candidate; dedupe the hashes we query for.
  const hashes = questions.map((q) => contentHash(q));
  const uniqueHashes = Array.from(new Set(hashes.filter(Boolean)));
  if (uniqueHashes.length === 0) return [];

  const query: FilterQuery<QuestionDoc> = {
    contentHash: { $in: uniqueHashes },
  };
  if (folderId && Types.ObjectId.isValid(folderId)) {
    query.folderId = new Types.ObjectId(folderId);
  }

  const existing = await Question.find(query)
    .select("contentHash title folderId")
    .lean<
      Pick<QuestionDoc, "_id" | "contentHash" | "title" | "folderId">[]
    >()
    .exec();

  // Group existing docs by hash.
  const byHash = new Map<
    string,
    { _id: string; title: string; folderId: string }[]
  >();
  for (const e of existing) {
    const list = byHash.get(e.contentHash) ?? [];
    list.push({
      _id: e._id.toString(),
      title: e.title ?? "",
      folderId: e.folderId.toString(),
    });
    byHash.set(e.contentHash, list);
  }

  const result: DuplicateMatch[] = [];
  hashes.forEach((h, index) => {
    const matches = byHash.get(h);
    if (matches && matches.length) result.push({ index, matches });
  });
  return result;
}
