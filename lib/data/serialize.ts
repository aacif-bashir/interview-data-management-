import type { FolderDoc } from "@/models/Folder";
import type { QuestionDoc } from "@/models/Question";
import type {
  FolderDTO,
  QuestionDTO,
  QuestionListItem,
} from "@/types";

/** Convert a Folder document (or lean object) into a JSON-safe DTO. */
export function serializeFolder(doc: FolderDoc): FolderDTO {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    parentId: doc.parentId ? doc.parentId.toString() : null,
    ancestors: (doc.ancestors ?? []).map((a) => a.toString()),
    path: doc.path,
    depth: doc.depth,
    questionCount: doc.questionCount ?? 0,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Full question DTO including markdown bodies. */
export function serializeQuestion(doc: QuestionDoc): QuestionDTO {
  return {
    _id: doc._id.toString(),
    folderId: doc.folderId.toString(),
    title: doc.title ?? "",
    question: doc.question,
    answer: doc.answer ?? "",
    status: doc.status,
    favorite: doc.favorite,
    tags: doc.tags ?? [],
    order: doc.order,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Lightweight list item (omits the answer/question bodies). */
export function serializeListItem(
  doc: Pick<
    QuestionDoc,
    | "_id"
    | "folderId"
    | "title"
    | "status"
    | "favorite"
    | "tags"
    | "order"
    | "createdAt"
    | "updatedAt"
  >
): QuestionListItem {
  return {
    _id: doc._id.toString(),
    folderId: doc.folderId.toString(),
    title: doc.title ?? "",
    status: doc.status,
    favorite: doc.favorite,
    tags: doc.tags ?? [],
    order: doc.order,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
