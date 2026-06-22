import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Missing MONGODB_URI environment variable. Set it in .env.local (see .env.example)."
  );
}

/**
 * Cache the connection on `globalThis` so that:
 *  - During development, Next.js HMR doesn't open a new connection on every
 *    file change (which would quickly exhaust Atlas connection limits).
 *  - In serverless, warm lambdas reuse the existing connection.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache =
  globalThis._mongooseCache ?? { conn: null, promise: null };

if (!globalThis._mongooseCache) {
  globalThis._mongooseCache = cached;
}

/**
 * Connect to MongoDB (idempotent). Every data-access function should await this
 * before issuing queries. Returns the shared mongoose instance.
 */
export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI as string, {
        // We always await dbConnect() before querying, so buffering would only
        // hide connection errors. Fail fast instead.
        bufferCommands: false,
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so the next call retries instead of reusing a rejected promise.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
