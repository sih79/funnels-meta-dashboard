"use server";

// Server Actions for the staff-only admin area (Phase 5).
//
// Every action re-checks staff access with requireStaff() first — Server
// Actions are reachable by direct POST, not just via our forms, so we must
// authorise inside each one (per the Next 16 "Mutating Data" security note).
//
// Reads/writes that RLS already permits (clients, ad_accounts) go through the
// user's own server client. Creating LOGINS (auth users) needs the
// service-role admin client, which bypasses RLS — that's server-only code and
// is never shipped to the browser.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff, isSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { backfillAdAccount } from "@/lib/sync";
import { slugify } from "@/lib/admin/slug";
import { encryptSecret } from "@/lib/crypto";
import type {
  AdAccountRow,
  BusinessManagerRow,
  ClientRow,
  AccountSource,
} from "@/lib/supabase/db.types";

// The shape every form action returns. `ok` drives whether we show a success
// or error message; `message` is plain-English copy safe to show the admin.
// (Type-only export — erased at build time, so it's allowed in a "use server"
// module alongside the async actions.)
export interface ActionResult {
  ok: boolean;
  message: string;
}

// Normalise a Meta account id so it always has the "act_" prefix. We accept
// "123", "act_123", or " act_123 " and always store "act_123".
function normalizeMetaAccountId(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/^act_/i, "");
  return `act_${digits}`;
}

/**
 * Create a new client row.
 * - name is required.
 * - slug defaults to a slugified name but the admin can override it; must be
 *   unique (we check explicitly for a friendly error, and the DB unique index
 *   is the final guard).
 * On success: revalidate the admin pages and redirect to the new client's page.
 */
export async function createClientAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const logoUrl = String(formData.get("logo_url") ?? "").trim();
  const businessManagerId = String(formData.get("business_manager_id") ?? "").trim();

  if (!name) {
    return { ok: false, message: "Please enter a client name." };
  }
  if (!businessManagerId) {
    return { ok: false, message: "Please select a business manager." };
  }

  const slug = slugify(rawSlug || name);
  if (!slug) {
    return {
      ok: false,
      message: "That name has no usable letters or numbers for a web address. Try a different slug.",
    };
  }

  const supabase = await createClient();

  // Friendly pre-check for a duplicate slug (the unique index is the real guard).
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("slug", slug)
    .limit(1);
  if (existing && existing.length > 0) {
    return {
      ok: false,
      message: `The web address "${slug}" is already taken. Pick a different slug.`,
    };
  }

  const insert: Partial<ClientRow> = {
    name,
    slug,
    logo_url: logoUrl || null,
    business_manager_id: businessManagerId,
  };

  const { error } = await supabase.from("clients").insert(insert as never);
  if (error) {
    return { ok: false, message: `Could not create client: ${error.message}` };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/clients/${slug}`);
  redirect(`/admin/clients/${slug}`);
}

/**
 * Attach an ad account to a client.
 * - meta_account_id accepted with or without "act_" prefix; normalised.
 * - source is 'agency' (default) or 'client_oauth'.
 * - currency defaults to 'GBP'.
 */
export async function createAdAccountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const rawMetaId = String(formData.get("meta_account_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const sourceRaw = String(formData.get("source") ?? "agency").trim();
  const currency = (String(formData.get("currency") ?? "GBP").trim() || "GBP").toUpperCase();

  if (!clientId) return { ok: false, message: "Missing client." };
  if (!rawMetaId) return { ok: false, message: "Please enter the Meta ad account ID." };
  if (!name) return { ok: false, message: "Please enter a display name for this account." };

  const source: AccountSource = sourceRaw === "client_oauth" ? "client_oauth" : "agency";
  const metaAccountId = normalizeMetaAccountId(rawMetaId);

  const supabase = await createClient();

  const insert: Partial<AdAccountRow> = {
    client_id: clientId,
    meta_account_id: metaAccountId,
    name,
    source,
    currency,
    status: "active",
  };

  const { error } = await supabase.from("ad_accounts").insert(insert as never);
  if (error) {
    return { ok: false, message: `Could not add ad account: ${error.message}` };
  }

  revalidatePath(`/admin/clients/${slug}`);
  return {
    ok: true,
    message: `Added ${metaAccountId}. ${
      source === "agency"
        ? "You can now backfill 90 days below."
        : "Client OAuth accounts are connected by the client (Phase 6)."
    }`,
  };
}

/**
 * Backfill the last 90 days for an agency ad account.
 * Calls backfillAdAccount() directly (it uses the admin client + the shared
 * META_ACCESS_TOKEN). If the Meta token isn't set, the sync layer records a
 * "skipped" result — we surface that as a friendly "add your Meta token" note
 * instead of an error.
 */
export async function backfillAdAccountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const adAccountId = String(formData.get("ad_account_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!adAccountId) return { ok: false, message: "Missing ad account." };

  // Friendly heads-up before we even try, so the admin isn't confused by a
  // silent "skipped".
  if (!process.env.META_ACCESS_TOKEN) {
    return {
      ok: false,
      message:
        "Add your Meta access token first (META_ACCESS_TOKEN in .env.local — see SETUP.md), then try the backfill again.",
    };
  }

  try {
    const result = await backfillAdAccount(adAccountId);
    if (!result) {
      return { ok: false, message: "Ad account not found." };
    }
    if (result.status === "skipped") {
      return {
        ok: false,
        message: `Skipped: ${result.error ?? "no Meta token for this account."}`,
      };
    }
    if (result.status === "error") {
      return { ok: false, message: `Backfill failed: ${result.error ?? "unknown error"}` };
    }
    revalidatePath(`/admin/clients/${slug}`);
    return {
      ok: true,
      message: `Backfill done — pulled ${result.rowsWritten} rows of data.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Backfill failed: ${message}` };
  }
}

// Generate a readable temporary password (no ambiguous chars), e.g. "Funnels-7K3Q9".
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `Funnels-${suffix}`;
}

/**
 * Invite a client login.
 *
 * Uses the service-role admin client (RLS-bypassing) to:
 *  1. Create an auth user with the given email + a generated temp password
 *     (email-confirmed immediately, since we hand the password over manually —
 *     real email delivery isn't wired up yet).
 *  2. Upsert their profiles row with role='client' and client_id = this client.
 *
 * Returns the email + temp password in the message so the admin can pass them
 * on. Handles "user already exists" gracefully: we reuse the existing auth user
 * and just (re)link their profile to this client, without resetting a password.
 */
export async function inviteClientLoginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!clientId) return { ok: false, message: "Missing client." };
  if (!email || !email.includes("@")) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  // 1. Create the auth user. If they already exist, fall back to linking.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true, // we hand over the password manually for now
  });

  let userId: string | null = created?.user?.id ?? null;
  let reusedExisting = false;

  if (createErr) {
    // Supabase returns a 422 "already registered" when the email exists.
    const alreadyExists =
      /already|registered|exists/i.test(createErr.message) ||
      (createErr as { status?: number }).status === 422;
    if (!alreadyExists) {
      return { ok: false, message: `Could not create login: ${createErr.message}` };
    }

    // Find the existing auth user by paging the admin list (no email filter API).
    userId = await findUserIdByEmail(admin, email);
    reusedExisting = true;
    if (!userId) {
      return {
        ok: false,
        message:
          "That email already has a login but we couldn't look it up. Check the user in Supabase.",
      };
    }
  }

  // 2. Upsert their profile so they can see this client's dashboard.
  const profileUpsert = {
    id: userId,
    role: "client" as const,
    client_id: clientId,
    full_name: fullName || null,
  };
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(profileUpsert as never, { onConflict: "id" });
  if (profileErr) {
    return { ok: false, message: `Created login but could not set role: ${profileErr.message}` };
  }

  revalidatePath(`/admin/clients/${slug}`);

  if (reusedExisting) {
    return {
      ok: true,
      message: `${email} already had a login — we linked it to this client. Their existing password still works.`,
    };
  }
  return {
    ok: true,
    message: `Login created. Email: ${email} · Temporary password: ${tempPassword} — copy these now and send them to the client. Ask them to change the password after first sign-in.`,
  };
}

/**
 * Invite an admin or staff login (Phase 5b).
 *
 * Creates a new auth user with a supplied email/password and tags their
 * profile with role ('admin'|'staff') + business_manager_id, so they show up
 * in the staff scope for that BM. Permission rules:
 *  - Only super_admins may invite into a business manager other than their own.
 *  - A regular admin/staff caller can only invite into THEIR OWN BM.
 *  - 'super_admin' and 'client' roles are NOT allowed via this form — the
 *    existing inviteClientLoginAction handles 'client'; super_admin must be
 *    promoted directly in the database.
 */
export async function inviteStaffAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const caller = await requireStaff();
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const businessManagerId = String(formData.get("business_manager_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  if (!password || password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (role !== "admin" && role !== "staff") {
    return { ok: false, message: "Role must be Admin or Staff." };
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!businessManagerId || !uuidRe.test(businessManagerId)) {
    return { ok: false, message: "Please select a business manager." };
  }

  // Permission gate: non-super_admins can only invite into their OWN BM.
  const callerIsSuperAdmin = isSuperAdmin(caller);
  if (!callerIsSuperAdmin) {
    if (!caller.business_manager_id || caller.business_manager_id !== businessManagerId) {
      return {
        ok: false,
        message: "You can only invite into your own business manager.",
      };
    }
  }

  const admin = createAdminClient();

  // 1. Create the auth user. Email-confirmed because the admin hands the
  // password over manually (no email delivery yet).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createErr) {
    const alreadyExists =
      /already|registered|exists/i.test(createErr.message) ||
      (createErr as { status?: number }).status === 422;
    if (alreadyExists) {
      return {
        ok: false,
        message: "That email already has a login. Promote them in Supabase or use a different email.",
      };
    }
    return { ok: false, message: `Could not create login: ${createErr.message}` };
  }

  const userId = created?.user?.id;
  if (!userId) {
    return { ok: false, message: "Login was created but no user id came back. Check Supabase." };
  }

  // 2. Update the profile (created by the 0003 trigger on auth.users insert).
  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      role: role as "admin" | "staff",
      business_manager_id: businessManagerId,
      full_name: fullName || null,
    } as never)
    .eq("id", userId);
  if (profileErr) {
    return { ok: false, message: `Created login but could not set role: ${profileErr.message}` };
  }

  revalidatePath("/admin");
  return { ok: true, message: "Admin invited" };
}

// Look up an auth user's id by email by paging through admin.listUsers.
// Supabase has no direct "get by email" admin API, so we scan pages.
async function findUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < perPage) break; // last page
  }
  return null;
}

// -----------------------------------------------------------------------------
// Business Manager management (super_admin only).
//
// These three actions manage the business_managers table and its per-BM Meta
// access token. RLS only lets super_admins write, but we ALSO gate inside each
// action — Server Actions are POSTable directly, so defence-in-depth is a must.
// Writes go through the service-role admin client for simplicity (the RLS gate
// is a backup; the explicit isSuperAdmin check here is the primary gate).
// -----------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Create a business manager. Optionally accepts an initial Meta access token,
 * which is encrypted via encryptSecret before being stored.
 */
export async function createBusinessManagerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const caller = await requireStaff();
  if (!isSuperAdmin(caller)) {
    return {
      ok: false,
      message: "Only super admins can manage business managers.",
    };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const token = String(formData.get("meta_access_token") ?? "").trim();

  if (!name) {
    return { ok: false, message: "Please enter a business manager name." };
  }

  const slug = slugify(rawSlug || name);
  if (!slug || !SLUG_RE.test(slug)) {
    return {
      ok: false,
      message:
        "Slug must be lowercase letters, numbers and hyphens only (e.g. 'sh-acq').",
    };
  }

  const admin = createAdminClient();

  // Friendly pre-check for a duplicate slug (DB unique constraint is the real guard).
  const { data: existing } = await admin
    .from("business_managers")
    .select("id")
    .eq("slug", slug)
    .limit(1);
  if (existing && existing.length > 0) {
    return {
      ok: false,
      message: `The slug "${slug}" is already taken. Pick a different one.`,
    };
  }

  const insert: Partial<BusinessManagerRow> = {
    name,
    slug,
  };
  if (token) {
    try {
      insert.meta_access_token_encrypted = encryptSecret(token);
      insert.meta_token_updated_at = new Date().toISOString();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: `Could not encrypt token: ${message}` };
    }
  }

  const { error } = await admin.from("business_managers").insert(insert as never);
  if (error) {
    return {
      ok: false,
      message: `Could not create business manager: ${error.message}`,
    };
  }

  revalidatePath("/admin/business-managers");
  revalidatePath("/admin");
  return { ok: true, message: `Created business manager "${name}".` };
}

/**
 * Update an existing business manager's name and slug. The Meta token is
 * managed separately by updateBusinessManagerTokenAction.
 */
export async function updateBusinessManagerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const caller = await requireStaff();
  if (!isSuperAdmin(caller)) {
    return {
      ok: false,
      message: "Only super admins can manage business managers.",
    };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "").trim();

  if (!id) return { ok: false, message: "Missing business manager id." };
  if (!name) return { ok: false, message: "Please enter a name." };

  const slug = slugify(rawSlug || name);
  if (!slug || !SLUG_RE.test(slug)) {
    return {
      ok: false,
      message:
        "Slug must be lowercase letters, numbers and hyphens only (e.g. 'sh-acq').",
    };
  }

  const admin = createAdminClient();

  // Slug must be unique across other rows (excluding self).
  const { data: clash } = await admin
    .from("business_managers")
    .select("id")
    .eq("slug", slug)
    .neq("id", id)
    .limit(1);
  if (clash && clash.length > 0) {
    return {
      ok: false,
      message: `The slug "${slug}" is already taken by another business manager.`,
    };
  }

  const { error } = await admin
    .from("business_managers")
    .update({ name, slug } as never)
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      message: `Could not update business manager: ${error.message}`,
    };
  }

  revalidatePath("/admin/business-managers");
  revalidatePath("/admin");
  return { ok: true, message: "Business manager updated." };
}

/**
 * Update (rotate) or remove the per-BM Meta access token.
 *
 * UX rules (kept simple to avoid confusion with password fields):
 *  - If `remove=1` is submitted, we clear the token regardless of input.
 *  - Otherwise, a non-empty `meta_access_token` REPLACES the existing one.
 *  - An empty submission with no `remove` flag is a no-op (returns an error
 *    so the admin gets clear feedback rather than a silent "nothing happened").
 */
export async function updateBusinessManagerTokenAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const caller = await requireStaff();
  if (!isSuperAdmin(caller)) {
    return {
      ok: false,
      message: "Only super admins can manage business managers.",
    };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Set up Supabase first (see SETUP.md)." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const remove = String(formData.get("remove") ?? "").trim() === "1";
  const token = String(formData.get("meta_access_token") ?? "").trim();

  if (!id) return { ok: false, message: "Missing business manager id." };

  const admin = createAdminClient();

  if (remove) {
    const { error } = await admin
      .from("business_managers")
      .update({
        meta_access_token_encrypted: null,
        meta_token_updated_at: null,
      } as never)
      .eq("id", id);
    if (error) {
      return { ok: false, message: `Could not remove token: ${error.message}` };
    }
    revalidatePath("/admin/business-managers");
    revalidatePath("/admin");
    return { ok: true, message: "Meta token removed." };
  }

  if (!token) {
    return {
      ok: false,
      message:
        "Paste a Meta access token to replace the current one, or use Remove to clear it.",
    };
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Could not encrypt token: ${message}` };
  }

  const { error } = await admin
    .from("business_managers")
    .update({
      meta_access_token_encrypted: encrypted,
      meta_token_updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) {
    return { ok: false, message: `Could not save token: ${error.message}` };
  }

  revalidatePath("/admin/business-managers");
  revalidatePath("/admin");
  return { ok: true, message: "Meta token saved." };
}
