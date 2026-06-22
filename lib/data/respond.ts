import { ZodError, type ZodType } from "zod";
import { DataError } from "./errors";

/** JSON response helper. */
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Parse + validate a JSON request body against a zod schema. Throws a
 * DataError(422) on validation failure so the shared catch handles it.
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new DataError("Invalid JSON body", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new DataError(formatZod(result.error), 422);
  }
  return result.data;
}

function formatZod(err: ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join(".");
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join("; ");
}

/**
 * Wrap a route handler body, converting DataError/unknown into JSON responses.
 * Usage: `return handle(async () => { ... return json(data) })`.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DataError) {
      return json({ error: err.message }, err.status);
    }
    console.error("[api] unhandled error:", err);
    return json({ error: "Internal server error" }, 500);
  }
}
