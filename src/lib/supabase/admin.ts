import "server-only";

// Service-role Supabase client. BYPASSES Row-Level Security.
//
// Use ONLY in trusted server-side code (the background sync job, admin
// scripts). NEVER import this into a Client Component or expose the key to
// the browser — the `server-only` import above will hard-error the build if
// you accidentally do.
//
// Lazy singleton: the client is created on first call, not at module load, so
// the app still builds when SUPABASE_SERVICE_ROLE_KEY is absent.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";
import type { Database } from "./db.types";

type AdminClient = ReturnType<typeof createSupabaseClient<Database>>;

let cached: AdminClient | null = null;

export function createAdminClient(): AdminClient {
  if (cached) return cached;

  cached = createSupabaseClient<Database>(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return cached;
}
