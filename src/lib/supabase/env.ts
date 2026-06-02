// Shared helpers for reading Supabase env vars.
//
// IMPORTANT: these functions are called lazily (inside the client factories),
// never at module top-level. This keeps `npm run build` working even when the
// env vars are absent — nothing throws until you actually try to create a
// client at request time.

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to .env.local (see SETUP.md).",
    );
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Add it to .env.local (see SETUP.md).",
    );
  }
  return key;
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local (see SETUP.md). " +
        "This is the secret service-role key — never expose it to the browser.",
    );
  }
  return key;
}

/**
 * True when the public Supabase env vars are present. Use this to decide
 * whether to even attempt a Supabase-backed code path, so the app degrades
 * gracefully (and builds) when Supabase isn't configured yet.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
