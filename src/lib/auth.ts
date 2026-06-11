import "server-only";

// Server-only auth helpers. These wrap the async Supabase server client and
// give the rest of the app a small, typed surface for "who is this request?"
// and "are they allowed here?".
//
// Use the require* helpers in Server Components / Route Handlers to gate access.
// They call redirect(), which throws a special Next.js signal — so anything
// after a require* call only runs for an authorised user.

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ProfileRow } from "@/lib/supabase/db.types";

/**
 * The current authenticated auth.users record, or null when signed out
 * (or when Supabase isn't configured — so callers degrade gracefully).
 *
 * Uses getUser() (not getSession()) because it re-validates the token with the
 * Supabase Auth server, which is the trustworthy check for protected routes.
 */
export async function getSessionUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/**
 * The current user's profile row (role, client_id, full_name, …), or null
 * when there is no signed-in user or no matching profile.
 */
export async function getProfile(): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (profile as ProfileRow | null) ?? null;
}

/**
 * Require a signed-in user. Redirects to /login when absent, otherwise returns
 * the auth user. (The proxy already guards routes, but calling this inside a
 * page is the recommended defence-in-depth — see the Next 16 proxy docs note
 * about verifying auth in the route itself.)
 */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Returns true when the profile has the super_admin role.
 * super_admin can see all clients across all business managers.
 */
export function isSuperAdmin(profile: ProfileRow): boolean {
  return profile.role === "super_admin";
}

/**
 * Require an admin/staff/super_admin profile. Redirects unauthenticated users
 * to /login and authenticated-but-unauthorised users (role 'client') to
 * /forbidden. Returns the profile so callers can use role/client_id.
 */
export async function requireStaff(): Promise<ProfileRow> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (
    !profile ||
    (profile.role !== "admin" &&
      profile.role !== "staff" &&
      profile.role !== "super_admin")
  ) {
    redirect("/forbidden");
  }
  return profile;
}
