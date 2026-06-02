"use client";

// Browser-side Supabase client for use in Client Components.
// Uses the public anon key (safe to ship to the browser; RLS protects data).

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./db.types";

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
