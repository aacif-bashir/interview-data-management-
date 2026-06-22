/**
 * Shared, serializable DTO types used by API routes and client components.
 * These are plain JSON shapes (string ids, ISO dates) — never Mongoose docs.
 */

export const QUESTION_STATUSES = [
  "not_studied",
  "learning",
  "mastered",
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  not_studied: "Not Studied",
  learning: "Learning",
  mastered: "Done",
};

/** A folder as returned by the API. */
export interface FolderDTO {
  _id: string;
  name: string;
  parentId: string | null;
  ancestors: string[];
  path: string;
  depth: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A folder node with its children attached — used to render the tree. */
export interface FolderTreeNode extends FolderDTO {
  children: FolderTreeNode[];
}

/** Lightweight question shape for list rows (no full answer body). */
export interface QuestionListItem {
  _id: string;
  folderId: string;
  title: string;
  status: QuestionStatus;
  favorite: boolean;
  tags: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Full question detail (includes raw markdown bodies). */
export interface QuestionDTO extends QuestionListItem {
  question: string;
  answer: string;
}

/** Cursor-paginated list response. */
export interface PaginatedQuestions {
  items: QuestionListItem[];
  nextCursor: string | null;
  total: number | null;
}

/** A pasted question that matches existing question(s) by content hash. */
export interface DuplicateMatch {
  index: number;
  matches: { _id: string; title: string; folderId: string }[];
}

/** Filters accepted by the question list endpoint. */
export interface QuestionListFilters {
  folderId?: string;
  subtree?: boolean;
  status?: QuestionStatus;
  favorite?: boolean;
  tags?: string[];
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}
