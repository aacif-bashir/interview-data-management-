/**
 * Server-side session helpers for Firebase Auth token verification.
 *
 * Flow (login):
 *  1. Client calls signInWithEmailAndPassword (Firebase Auth)
 *  2. Client posts the resulting ID token to /api/auth/login
 *  3. Server verifies the token with the Admin SDK and sets an httpOnly cookie
 *  4. proxy.ts verifies the cookie on every subsequent request
 *
 * Flow (signup):
 *  1. Client posts firstName, lastName, email, password to /api/auth/signup
 *  2. Server creates the Firebase Auth user + Firestore users/{uid} document
 *  3. Server signs the user in and issues a session cookie
 */

import { getAuth } from "firebase-admin/auth";
import { getDb, initFirebaseAdmin } from "@/lib/firebase";
import type { UserRecord, UserRole, UserStatus } from "@/types/user";

export const SESSION_COOKIE = "session";

/** 5 days in milliseconds. */
export const SESSION_COOKIE_MAX_AGE_MS = 60 * 60 * 24 * 5 * 1000;

// ─── Session cookie ───────────────────────────────────────────────────────────

/**
 * Exchange a short-lived Firebase ID token for a long-lived session cookie.
 * Called once immediately after signInWithEmailAndPassword on the client.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  initFirebaseAdmin();
  return getAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_COOKIE_MAX_AGE_MS,
  });
}

/**
 * Verify a session cookie. Returns decoded claims or null if invalid/expired.
 */
export async function verifySessionCookie(
  cookie: string | undefined
): Promise<{ uid: string; email: string } | null> {
  if (!cookie) return null;
  try {
    initFirebaseAdmin();
    const decoded = await getAuth().verifySessionCookie(cookie, true);
    return { uid: decoded.uid, email: decoded.email ?? "" };
  } catch {
    return null;
  }
}

// ─── User document helpers ────────────────────────────────────────────────────

function toIso(v: unknown): string {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

/** Serialize a raw Firestore snap to a clean UserRecord DTO. */
export function serializeUser(
  uid: string,
  data: Record<string, unknown>
): UserRecord {
  return {
    id: uid,
    email: (data.email as string) ?? "",
    firstName: (data.firstName as string) ?? "",
    lastName: (data.lastName as string) ?? "",
    displayName: (data.displayName as string) ?? "",
    photoUrl: (data.photoUrl as string | null) ?? null,
    role: (data.role as UserRole) ?? "viewer",
    status: (data.status as UserStatus) ?? "active",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Create a brand-new user document in `users/{uid}`.
 * Called during signup — the document must not already exist.
 */
export async function createUserRecord(opts: {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  photoUrl?: string | null;
}): Promise<UserRecord> {
  const db = getDb();
  const now = new Date();
  const displayName =
    opts.displayName?.trim() ||
    `${opts.firstName} ${opts.lastName}`.trim();

  const data = {
    email: opts.email,
    firstName: opts.firstName.trim(),
    lastName: opts.lastName.trim(),
    displayName,
    photoUrl: opts.photoUrl ?? null,
    role: "viewer" as UserRole,
    status: "active" as UserStatus,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("users").doc(opts.uid).set(data);
  return serializeUser(opts.uid, { ...data, createdAt: now, updatedAt: now });
}

/**
 * Update metadata on an existing user document (email sync, photo, etc.).
 * Never overwrites role or status.
 */
export async function touchUserRecord(
  uid: string,
  patch: { email?: string; photoUrl?: string | null }
): Promise<void> {
  const db = getDb();
  await db
    .collection("users")
    .doc(uid)
    .update({ ...patch, updatedAt: new Date() });
}

/** Fetch a user record by uid. Returns null if the document doesn't exist. */
export async function getUserRecord(uid: string): Promise<UserRecord | null> {
  const db = getDb();
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return serializeUser(uid, snap.data() as Record<string, unknown>);
}
