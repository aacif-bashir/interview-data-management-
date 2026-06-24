import { z } from "zod";
import { QUESTION_STATUSES } from "@/types";

/** A Firestore document ID (or any non-empty string ID up to 128 chars). */
export const objectId = z
  .string()
  .min(1, "Invalid id")
  .max(128, "Invalid id")
  .regex(/^[\w-]+$/, "Invalid id");

export const statusSchema = z.enum(QUESTION_STATUSES);

// ---- Folders ----

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  parentId: objectId.nullable().optional(),
});

export const renameFolderSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export const moveFolderSchema = z.object({
  newParentId: objectId.nullable(),
});

// ---- Questions ----

const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(50)
  .optional();

export const createQuestionSchema = z.object({
  folderId: objectId,
  question: z.string().min(1, "Question is required"),
  answer: z.string().default(""),
  tags: tagsSchema,
  status: statusSchema.optional(),
});

export const updateQuestionSchema = z
  .object({
    question: z.string().min(1).optional(),
    answer: z.string().optional(),
    tags: tagsSchema,
    status: statusSchema.optional(),
    favorite: z.boolean().optional(),
    folderId: objectId.optional(),
    order: z.number().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "No fields to update",
  });

export const statusUpdateSchema = z.object({ status: statusSchema });
export const favoriteUpdateSchema = z.object({ favorite: z.boolean() });

/** The mapped paste-and-map bulk save. */
export const bulkCreateSchema = z.object({
  folderId: objectId,
  pairs: z
    .array(
      z.object({
        question: z.string().default(""),
        answer: z.string().default(""),
      })
    )
    .min(1, "At least one pair is required")
    .max(2000, "Too many pairs in one save"),
  tags: tagsSchema,
  status: statusSchema.optional(),
});

export const checkDuplicatesSchema = z.object({
  questions: z.array(z.string()).max(2000),
  folderId: objectId.optional(),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type BulkCreateInput = z.infer<typeof bulkCreateSchema>;
