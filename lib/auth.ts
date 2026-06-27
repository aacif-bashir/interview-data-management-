/**
 * @deprecated Import from "@/firebase-services/auth" instead.
 * This shim is kept for backward compatibility.
 */
export {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
  createSessionCookie,
  verifySessionCookie,
  serializeUser,
  createUserRecord,
  touchUserRecord,
  getUserRecord,
} from "@/firebase-services/auth";
