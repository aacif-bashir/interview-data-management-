import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/data/respond";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
  createSessionCookie,
  createUserRecord,
} from "@/lib/auth";

const schema = z.object({
  /** Firebase ID token returned by createUserWithEmailAndPassword on the client. */
  idToken: z.string().min(1),
  uid: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { idToken, uid, email, firstName, lastName } = await parseBody(req, schema);

    // Exchange the short-lived ID token for a long-lived session cookie.
    const sessionCookie = await createSessionCookie(idToken);

    // Create user record in Firestore.
    await createUserRecord({ uid, email, firstName, lastName });

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
    console.error("[auth] signup error:", err);
    return NextResponse.json({ error: "Sign up failed" }, { status: 400 });
  }
}
