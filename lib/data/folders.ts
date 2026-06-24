/**
 * Re-exports all folder data-access functions from the Firebase (Firestore)
 * implementation. Route handlers import from here and are unaffected by the
 * backend swap.
 */
export {
  getFolderTree,
  getFolder,
  getFolderWithBreadcrumb,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
} from "./firebase-folders";
