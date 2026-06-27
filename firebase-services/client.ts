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
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";

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
