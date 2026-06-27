import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/auth";

/**
 * Auth gate. Every page and API route is protected — a request without a valid
 * Firebase session cookie is redirected to /login (pages) or rejected with 401
 * (API calls). The login page and login API are the only public paths.
 *
 * Next.js 16 renamed `middleware` → `proxy` and runs it on the Node runtime,
 * so the firebase-admin verification in verifySessionCookie works here.
 */
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
