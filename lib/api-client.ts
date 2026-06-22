"use client";

import type {
  DuplicateMatch,
  FolderDTO,
  FolderTreeNode,
  PaginatedQuestions,
  QuestionDTO,
  QuestionListFilters,
  QuestionStatus,
} from "@/types";

/** Thin fetch wrapper that throws on non-2xx with the server error message. */
async function request<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ---- Folders ----

export const foldersApi = {
  tree: () => request<FolderTreeNode[]>("/api/folders"),
  create: (name: string, parentId: string | null) =>
    request<FolderDTO>("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name, parentId }),
    }),
  rename: (id: string, name: string) =>
    request<FolderDTO>(`/api/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  move: (id: string, newParentId: string | null) =>
    request<FolderDTO>(`/api/folders/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ newParentId }),
    }),
  remove: (id: string, cascade: boolean) =>
    request<{ deletedFolders: number; deletedQuestions: number }>(
      `/api/folders/${id}?cascade=${cascade}`,
      { method: "DELETE" }
    ),
};

// ---- Questions ----

function buildQuestionQuery(filters: QuestionListFilters): string {
  const sp = new URLSearchParams();
  if (filters.folderId) sp.set("folderId", filters.folderId);
  if (filters.subtree) sp.set("subtree", "true");
  if (filters.status) sp.set("status", filters.status);
  if (typeof filters.favorite === "boolean")
    sp.set("favorite", String(filters.favorite));
  if (filters.tags?.length) sp.set("tags", filters.tags.join(","));
  if (filters.q) sp.set("q", filters.q);
  if (filters.dateFrom) sp.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) sp.set("dateTo", filters.dateTo);
  if (filters.cursor) sp.set("cursor", filters.cursor);
  if (filters.limit) sp.set("limit", String(filters.limit));
  return sp.toString();
}

export const questionsApi = {
  list: (filters: QuestionListFilters) =>
    request<PaginatedQuestions>(
      `/api/questions?${buildQuestionQuery(filters)}`
    ),
  get: (id: string) => request<QuestionDTO>(`/api/questions/${id}`),
  create: (input: {
    folderId: string;
    question: string;
    answer: string;
    tags?: string[];
    status?: QuestionStatus;
  }) =>
    request<QuestionDTO>("/api/questions", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (
    id: string,
    patch: Partial<{
      question: string;
      answer: string;
      tags: string[];
      status: QuestionStatus;
      favorite: boolean;
      folderId: string;
      order: number;
    }>
  ) =>
    request<QuestionDTO>(`/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  setStatus: (id: string, status: QuestionStatus) =>
    request<QuestionDTO>(`/api/questions/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  setFavorite: (id: string, favorite: boolean) =>
    request<QuestionDTO>(`/api/questions/${id}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ favorite }),
    }),
  remove: (id: string) =>
    request<{ ok: true }>(`/api/questions/${id}`, { method: "DELETE" }),
  bulkCreate: (input: {
    folderId: string;
    pairs: { question: string; answer: string }[];
    tags?: string[];
    status?: QuestionStatus;
  }) =>
    request<{ insertedCount: number; firstOrder: number; lastOrder: number }>(
      "/api/questions/bulk",
      { method: "POST", body: JSON.stringify(input) }
    ),
  checkDuplicates: (questions: string[], folderId?: string) =>
    request<{ duplicates: DuplicateMatch[] }>(
      "/api/questions/check-duplicates",
      {
        method: "POST",
        body: JSON.stringify({ questions, folderId }),
      }
    ),
};

// ---- Markdown rendering ----

export const renderApi = {
  many: (sources: string[]) =>
    request<{ html: string[] }>("/api/render", {
      method: "POST",
      body: JSON.stringify({ sources }),
    }),
};
