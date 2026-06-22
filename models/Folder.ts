import mongoose, {
  Schema,
  type Model,
  type Types,
  type InferSchemaType,
  type HydratedDocument,
} from "mongoose";

/**
 * Folder tree stored with BOTH a direct `parentId` (for child queries, rename,
 * move) and a materialized `ancestors` array + denormalized `path`. The
 * `ancestors` array makes "all questions in this folder and its descendants" a
 * single indexed lookup (`{ ancestors: id }`) with no recursion or $graphLookup.
 */
const FolderSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    // Ordered root -> immediate parent. Empty for root folders.
    ancestors: {
      type: [Schema.Types.ObjectId],
      default: [],
      index: true, // multikey: subtree / descendant lookups
    },
    // Slugified, e.g. "/frontend/react". Unique to prevent duplicate paths.
    path: {
      type: String,
      required: true,
    },
    depth: {
      type: Number,
      required: true,
      default: 0,
    },
    // Denormalized count of questions directly in this folder.
    questionCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Sibling names must be unique within the same parent; also orders children.
FolderSchema.index({ parentId: 1, name: 1 }, { unique: true });
// Unique path prevents collisions and powers breadcrumb lookups.
FolderSchema.index({ path: 1 }, { unique: true });

// Plain (lean) shape of a folder's fields + base fields.
export type FolderDoc = InferSchemaType<typeof FolderSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

// Hydrated document returned by find()/findById() — has .save(), etc.
export type FolderDocument = HydratedDocument<FolderDoc>;

// Avoid model recompilation errors during HMR.
export const Folder: Model<FolderDoc> =
  (mongoose.models.Folder as Model<FolderDoc>) ||
  mongoose.model<FolderDoc>("Folder", FolderSchema);
