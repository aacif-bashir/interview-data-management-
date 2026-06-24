/**
 * Re-exports all question data-access functions from the Firebase (Firestore)
 * implementation. Route handlers import from here and are unaffected by the
 * backend swap.
 */
export {
  listQuestions,
  getQuestion,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  setStatus,
  setFavorite,
  deleteQuestion,
  findDuplicates,
} from "./firebase-questions";
