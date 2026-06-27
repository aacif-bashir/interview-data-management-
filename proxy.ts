import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Auth gate. Every page and API route is protected — a request without a valid
 * Firebase session cookie is redirected to /login (pages) or rejected with 401
 * (API calls). The login page and login API are the only public paths.
 *
 * NOTE: We use jose directly here instead of firebase-admin to avoid the
 * ERR_REQUIRE_ESM crash on Vercel. firebase-admin pulls in jwks-rsa which
 * calls require() on jose (ESM-only), breaking in Node runtime on Vercel.
 * jose works natively in both Edge and Node runtimes.
 *
 * Firebase session cookies are RS256-signed JWTs — we verify them against
 * Firebase's public JWKS endpoint without needing the full Admin SDK.
 */

export const SESSION_COOKIE = "session";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "";

// Firebase uses a proper JWKS endpoint for session cookie verification.
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// Cache the JWKS fetcher across requests (jose handles key rotation internally).
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  }
  return _jwks;
}

/**
 * Verify a Firebase session cookie using jose + Firebase's public JWKS.
 * Returns basic user info or null if the cookie is invalid/expired.
 */
async function verifySessionCookie(
  cookie: string | undefined
): Promise<{ uid: string; email: string } | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, getJwks(), {
      issuer: `https://session.firebase.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    const uid = (payload.sub ?? payload.uid ?? "") as string;
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
