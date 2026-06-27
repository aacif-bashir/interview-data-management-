import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeProtectedHeader, importX509, jwtVerify } from "jose";

/**
 * Auth gate. Every page and API route is protected — a request without a valid
 * Firebase session cookie is redirected to /login (pages) or rejected with 401
 * (API calls). The login page and login API are the only public paths.
 *
 * NOTE: We use jose directly here instead of firebase-admin to avoid the
 * ERR_REQUIRE_ESM crash on Vercel. firebase-admin pulls in jwks-rsa which
 * calls require() on jose (ESM-only), breaking in Node runtime on Vercel.
 *
 * Firebase session cookies (created by Admin SDK's createSessionCookie) are
 * RS256-signed JWTs. Their public keys are served as PEM X.509 certificates
 * at a DIFFERENT endpoint than ID-token keys — we fetch, cache, and verify
 * them here using jose's importX509 (no Admin SDK needed).
 */

export const SESSION_COOKIE = "session";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "";

/**
 * Firebase session-cookie public keys endpoint.
 * Returns { [kid]: "-----BEGIN CERTIFICATE-----\n..." }
 * This is DIFFERENT from the ID-token JWKS endpoint.
 */
const SESSION_KEYS_URL =
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys";

// ─── Key cache ────────────────────────────────────────────────────────────────
// Cache the raw PEM map with a TTL derived from the response's max-age header.
let _keysCache: { keys: Record<string, string>; expiresAt: number } | null = null;

async function fetchSessionKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_keysCache && now < _keysCache.expiresAt) {
    return _keysCache.keys;
  }

  const res = await fetch(SESSION_KEYS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Firebase session keys: ${res.status}`);

  const keys: Record<string, string> = await res.json();

  // Respect Cache-Control: max-age so we rotate with Firebase's key rotation schedule.
  const cc = res.headers.get("cache-control") ?? "";
  const maxAgeMatch = cc.match(/max-age=(\d+)/);
  const ttlMs = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 60_000;

  _keysCache = { keys, expiresAt: now + ttlMs };
  return keys;
}

/**
 * Verify a Firebase session cookie using its PEM certificate.
 * Returns basic user info or null if the cookie is invalid/expired.
 */
async function verifySessionCookie(
  cookie: string | undefined
): Promise<{ uid: string; email: string } | null> {
  if (!cookie) return null;
  try {
    // Decode the JWT header to find which key signed this cookie.
    const header = decodeProtectedHeader(cookie);
    const kid = header.kid;
    if (!kid) return null;

    // Fetch the PEM cert map and find the matching cert.
    const keys = await fetchSessionKeys();
    const cert = keys[kid];
    if (!cert) return null;

    // Import the X.509 certificate and verify the JWT.
    const publicKey = await importX509(cert, "RS256");
    const { payload } = await jwtVerify(cookie, publicKey, {
      issuer: `https://session.firebase.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });

    const uid = (payload.sub ?? "") as string;
    const email = (payload.email ?? "") as string;
    if (!uid) return null;
    return { uid, email };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" || pathname.startsWith("/api/auth/");

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await verifySessionCookie(token);
  const authed = user !== null;

  // Already signed in — bounce off /login back to the app.
  if (authed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublic || authed) {
    return NextResponse.next();
  }

  // Unauthenticated: API → 401, page → redirect to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
