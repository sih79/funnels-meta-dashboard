import "server-only";

// Server-side Supabase client for Server Components, Route Handlers and
// Server Actions. Wired to Next.js 16's ASYNC `cookies()` API.
//
// Next 16 note: `cookies()` returns a Promise — you MUST await it (verified
// against node_modules/next/dist/docs/.../functions/cookies.md). That's why
// this factory is async. The @supabase/ssr getAll/setAll pattern is the
// current recommended approach (the old get/set/remove triplet is removed).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./db.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In Server Components, setting cookies throws (you can only read
        // there). We swallow that: when this client is used inside a Server
        // Component the session refresh is handled by middleware instead.
        // In Route Handlers / Server Actions the set succeeds normally.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — safe to ignore.
        }
      },
    },
  });
}
