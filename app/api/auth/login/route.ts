import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/data/respond";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
  createSessionCookie,
  touchUserRecord,
} from "@/firebase-services/auth";

const schema = z.object({
  /** Firebase ID token returned by signInWithEmailAndPassword on the client. */
  idToken: z.string().min(1),
  uid: z.string().min(1),
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const { idToken, uid, email } = await parseBody(req, schema);

    // Exchange the short-lived ID token for a long-lived session cookie.
    const sessionCookie = await createSessionCookie(idToken);

    // Update user record (sync email/last seen).
    await touchUserRecord(uid, { email });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_MS / 1000, // maxAge is in seconds
    });
    return res;
  } catch (err) {
    console.error("[auth] login error:", err);
    return NextResponse.json({ error: "Sign in failed" }, { status: 401 });
  }
}

export async function DELETE() {
  // Logout: clear the session cookie.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
