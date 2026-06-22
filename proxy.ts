import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Single-user access gate. Every page and API route is protected: a request
 * without a valid, unexpired session cookie is redirected to `/login` (for
 * page navigations) or rejected with 401 (for API calls). The login page and
 * the login API itself are the only public paths.
 *
 * Next.js 16 renamed `middleware` to `proxy` and runs it on the Node.js
 * runtime, so the HMAC verification in `verifySessionToken` works here.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" || pathname === "/api/auth/login";

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authed = verifySessionToken(token, Date.now());

  // Already signed in but sitting on /login → send to the app.
  if (authed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublic || authed) {
    return NextResponse.next();
  }

  // Unauthenticated. API callers get a clean 401; page visitors get redirected
  // to the login screen (preserving where they were headed).
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("from", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next internals and static assets. The login page
  // and login API are handled inside the proxy (so authed users get bounced
  // off /login), not excluded here.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
