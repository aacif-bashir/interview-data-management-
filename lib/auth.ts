import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single-user authentication. There are no accounts — access is gated by one
 * shared password (`AUTH_PASSWORD`). On a successful login we issue a signed
 * session cookie; the proxy (lib middleware) verifies that signature on every
 * request, so the cookie cannot be forged without `AUTH_SECRET`.
 */

export const SESSION_COOKIE = "session";

/** How long a session stays valid, in seconds (30 days). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return secret;
}

/** Constant-time string comparison to avoid leaking timing information. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Validate a submitted password against the configured `AUTH_PASSWORD`. */
export function isValidPassword(password: string): boolean {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected) {
    throw new Error("AUTH_PASSWORD is not set");
  }
  return safeEqual(password, expected);
}

/**
 * A session token is `<expiresAtMs>.<hmac>`. The HMAC covers the expiry, so the
 * token is both tamper-proof and self-expiring without any server-side store.
 */
export function createSessionToken(now: number): string {
  const expiresAt = now + SESSION_MAX_AGE * 1000;
  const signature = sign(String(expiresAt));
  return `${expiresAt}.${signature}`;
}

/** Verify a session token's signature and that it hasn't expired. */
export function verifySessionToken(token: string | undefined, now: number): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}
