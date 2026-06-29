/**
 * Firebase Client SDK singleton for browser use.
 *
 * Uses NEXT_PUBLIC_ environment variables — these are baked into the client
 * bundle at build time and are safe to expose publicly (the security is
 * enforced by Firestore Security Rules, not by keeping the config secret).
 *
 * Required env vars (set in .env):
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 *
 * Persistence: we intentionally use memoryLocalCache (no IndexedDB) to avoid
 * "Another write batch or compaction is already active" errors that occur when
 * multiple batched writes run close together. This app always reads fresh data
 * from Firestore, so offline caching provides no benefit.
 *
 * Auth: Firebase Auth persists its state in localStorage. On every page load
 * the SDK restores that state asynchronously. Call `ensureFirebaseAuthReady()`
 * before any Firestore write so the auth token is attached and the
 * `request.auth != null` Firestore rule is satisfied.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export function getClientApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let _db: Firestore | undefined;
let _auth: Auth | undefined;

/**
 * Returns the cached client-side Firestore instance (memory cache, no IndexedDB).
 * Safe to call repeatedly — always returns the same instance.
 */
export function getClientDb(): Firestore {
  if (!_db) {
    _db = initializeFirestore(getClientApp(), {
      localCache: memoryLocalCache(),
    });
  }
  return _db;
}

/**
 * Returns the Firebase Auth instance for the client app.
 * Initializing Auth here (vs. only in LoginForm) ensures it shares the same
 * FirebaseApp as Firestore, so auth tokens are automatically attached to writes.
 */
export function getClientAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getClientApp());
  }
  return _auth;
}

/**
 * Wait for Firebase Auth to finish restoring its persisted state from
 * localStorage. On page load the SDK is ready within ~100 ms; awaiting this
 * before the first Firestore write guarantees `request.auth` is non-null and
 * the Firestore security rules (`allow write: if request.auth != null`) pass.
 *
 * If called while a user is actively signed in (e.g. mid-session) this resolves
 * immediately with the current user.
 */
export function ensureFirebaseAuthReady(): Promise<void> {
  const auth = getClientAuth();
  // If auth is already initialised (currentUser is set or definitely null after
  // first check), resolve immediately.
  if (auth.currentUser !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
}
