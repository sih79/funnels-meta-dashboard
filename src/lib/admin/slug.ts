// Shared slug helper. Kept in its own (non-"use server") module so it can be
// imported by both the server actions and client form components — a
// "use server" file may only export async functions.

// Turn any free text into a clean URL slug: lowercase, spaces/punctuation →
// single hyphens, trimmed. e.g. "Acme Co. Ltd!" → "acme-co-ltd".
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
