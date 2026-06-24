import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK singleton.
 *
 * Credentials are supplied via environment variables — either the full JSON
 * service account as FIREBASE_SERVICE_ACCOUNT_JSON, or the three individual
 * fields (project id, client email, private key) which are easier to set in
 * deployment dashboards that don't accept multi-line secrets.
 */

declare global {
  // eslint-disable-next-line no-var
  var _firebaseApp: App | undefined;
  // eslint-disable-next-line no-var
  var _firestore: Firestore | undefined;
}

function buildCredential() {
  // Prefer a single JSON blob (useful for local dev via .env.local).
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      return cert(sa);
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON."
      );
    }
  }

  // Fall back to individual fields (useful for Vercel / Railway / Render env vars).
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase credentials are not configured. " +
        "Set FIREBASE_SERVICE_ACCOUNT_JSON or all of " +
        "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY " +
        "in your environment."
    );
  }

  return cert({ projectId, clientEmail, privateKey });
}

function initFirebase(): App {
  if (globalThis._firebaseApp) return globalThis._firebaseApp;

  // During Next.js HMR the module may be re-evaluated; reuse an existing app.
  if (getApps().length > 0) {
    globalThis._firebaseApp = getApps()[0];
    return globalThis._firebaseApp!;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    (() => {
      try {
        return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}").project_id;
      } catch {
        return undefined;
      }
    })();

  globalThis._firebaseApp = initializeApp({
    credential: buildCredential(),
    projectId,
  });

  return globalThis._firebaseApp;
}

/**
 * Returns the cached Firestore instance, initializing Firebase on first call.
 * Every data-access function should call this before issuing queries.
 */
export function getDb(): Firestore {
  if (globalThis._firestore) return globalThis._firestore;
  initFirebase();
  const db = getFirestore();
  // Use ISO date strings rather than Timestamp objects so DTOs stay plain JSON.
  db.settings({ ignoreUndefinedProperties: true });
  globalThis._firestore = db;
  return db;
}
