import mongoose, { Schema, type Model, type Types, type InferSchemaType } from "mongoose";
import { QUESTION_STATUSES } from "@/types";

/**
 * A single coding-interview Q/A pair. Questions are ordered within a folder by
 * `order` (gap-spaced by 1000 so inserts/appends rarely renumber). Bodies are
 * stored as raw Markdown.
 */
const QuestionSchema = new Schema(
  {
    folderId: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      required: true,
    },
    // Sort key within a folder. Gap-spaced (1000, 2000, ...).
    order: {
      type: Number,
      required: true,
    },
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      default: "",
    },
    // Short derived title (~first 120 chars of the question) for rows + search.
    title: {
      type: String,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: QUESTION_STATUSES,
      default: "not_studied",
    },
    favorite: {
      type: Boolean,
      default: false,
    },
    // sha256 of normalized question text — dedup hint (Phase 2). NOT unique:
    // a legitimate re-paste must never be blocked at the DB level.
    contentHash: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Hot path: list a folder's questions in order, and cursor-paginate.
QuestionSchema.index({ folderId: 1, order: 1 });
// Filter by status within a folder, still ordered.
QuestionSchema.index({ folderId: 1, status: 1, order: 1 });
// Favorites view, most-recently-updated first.
QuestionSchema.index({ favorite: 1, updatedAt: -1 });
// Recency / date-range filtering.
QuestionSchema.index({ createdAt: -1 });
// Tag filtering (multikey).
QuestionSchema.index({ tags: 1 });
// Dedup lookup (Phase 2).
QuestionSchema.index({ contentHash: 1 });
// Global full-text search. Only one text index per collection is allowed.
QuestionSchema.index(
  { title: "text", question: "text", answer: "text", tags: "text" },
  {
    weights: { title: 10, tags: 5, question: 2, answer: 1 },
    name: "q_text",
  }
);

export type QuestionDoc = InferSchemaType<typeof QuestionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Question: Model<QuestionDoc> =
  (mongoose.models.Question as Model<QuestionDoc>) ||
  mongoose.model<QuestionDoc>("Question", QuestionSchema);
