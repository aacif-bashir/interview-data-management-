/**
 * Shared user types used across the application.
 * The `users` Firestore collection stores one document per Firebase Auth UID.
 */

export type UserRole = "admin" | "editor" | "viewer";
export type UserStatus = "active" | "suspended";

/** Shape stored in Firestore `users/{uid}`. */
export interface UserRecord {
  id: string;           // same as Firebase Auth UID (document id)
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;  // derived: `${firstName} ${lastName}` or custom
  photoUrl: string | null;
  role: UserRole;       // "viewer" by default; only Admin SDK can change
  status: UserStatus;   // "active" by default
  createdAt: string;    // ISO string
  updatedAt: string;    // ISO string
}

/** Shape sent to the client (safe subset — role is included for UI gating). */
export type UserDTO = UserRecord;
