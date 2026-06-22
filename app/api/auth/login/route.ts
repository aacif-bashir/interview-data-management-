import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  isValidPassword,
} from "@/lib/auth";
import { parseBody } from "@/lib/data/respond";
import { DataError } from "@/lib/data/errors";

const loginSchema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { password } = await parseBody(req, loginSchema);

    if (!isValidPassword(password)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, createSessionToken(Date.now()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    if (err instanceof DataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[auth] login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
