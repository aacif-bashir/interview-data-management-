import { createHash } from "node:crypto";

/**
 * Normalize question text for duplicate detection: lowercase, collapse
 * whitespace, strip surrounding whitespace. Markdown punctuation is kept so
 * that genuinely different questions don't collide.
 */
export function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** sha256 of the normalized question text. Used as a dedup hint (not unique). */
export function contentHash(question: string): string {
  return createHash("sha256")
    .update(normalizeForHash(question))
    .digest("hex");
}
