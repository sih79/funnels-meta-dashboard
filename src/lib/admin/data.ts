import "server-only";

// Server-only data reads for the admin area. Staff-only callers (pages already
// gate with requireStaff()). Uses the admin/service-role client so we can read
// auth.users-linked profiles + sync_log regardless of RLS shape, since the
// admin needs a full picture. All functions degrade to empty/null when
// Supabase isn't configured so the app still builds offline.

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  AdAccountRow,
  BusinessManagerRow,
  ClientRow,
  ProfileRow,
  SyncLogRow,
  TrackedConversionRow,
} from "@/lib/supabase/db.types";

export interface BusinessManagerSummary {
  id: string;
  name: string;
  slug: string;
}

/** All business managers, for dropdowns and labels. RLS-enforced (staff/super_admin only). */
export async function getBusinessManagers(): Promise<BusinessManagerSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("business_managers")
    .select("id, name, slug")
    .order("name", { ascending: true });
  if (error || !data) return [];

  return (data as Pick<BusinessManagerRow, "id" | "name" | "slug">[]).map((bm) => ({
    id: bm.id,
    name: bm.name,
    slug: bm.slug,
  }));
}

export interface BusinessManagerWithTokenStatus {
  id: string;
  name: string;
  slug: string;
  hasMetaToken: boolean;
  metaTokenUpdatedAt: string | null;
}

/**
 * Business managers + a boolean flag for whether a per-BM Meta token is set.
 * NEVER returns the ciphertext or the plaintext token — only the boolean and
 * the "set when" timestamp. Safe to render in a server component.
 */
export async function getBusinessManagersWithTokenStatus(): Promise<
  BusinessManagerWithTokenStatus[]
> {
  if (!isSupabaseConfigured()) return [];
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("business_managers")
    .select("id, name, slug, meta_access_token_encrypted, meta_token_updated_at")
    .order("name", { ascending: true });
  if (error || !data) return [];

  return (
    data as Pick<
      BusinessManagerRow,
      "id" | "name" | "slug" | "meta_access_token_encrypted" | "meta_token_updated_at"
    >[]
  ).map((bm) => ({
    id: bm.id,
    name: bm.name,
    slug: bm.slug,
    hasMetaToken: Boolean(bm.meta_access_token_encrypted),
    metaTokenUpdatedAt: bm.meta_token_updated_at,
  }));
}

export interface AdminClientSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  adAccountCount: number;
  businessManagerName: string | null;
}

/** All clients with a count of their ad accounts and BM name, for the /admin landing. */
export async function getAdminClients(): Promise<AdminClientSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = createAdminClient();

  const { data: clients, error } = await admin
    .from("clients")
    .select("id, name, slug, logo_url, business_manager_id")
    .order("name", { ascending: true });
  if (error || !clients) return [];

  const { data: accounts } = await admin.from("ad_accounts").select("client_id");
  const counts = new Map<string, number>();
  for (const a of (accounts as Pick<AdAccountRow, "client_id">[] | null) ?? []) {
    counts.set(a.client_id, (counts.get(a.client_id) ?? 0) + 1);
  }

  // Fetch BM names to avoid N+1. Build a lookup map.
  const bmIds = [
    ...new Set(
      (clients as Pick<ClientRow, "id" | "name" | "slug" | "logo_url" | "business_manager_id">[])
        .map((c) => c.business_manager_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const bmNames = new Map<string, string>();
  if (bmIds.length > 0) {
    const { data: bms } = await admin
      .from("business_managers")
      .select("id, name")
      .in("id", bmIds);
    for (const bm of (bms as Pick<BusinessManagerRow, "id" | "name">[] | null) ?? []) {
      bmNames.set(bm.id, bm.name);
    }
  }

  return (
    clients as Pick<ClientRow, "id" | "name" | "slug" | "logo_url" | "business_manager_id">[]
  ).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    logoUrl: c.logo_url,
    adAccountCount: counts.get(c.id) ?? 0,
    businessManagerName: c.business_manager_id ? (bmNames.get(c.business_manager_id) ?? null) : null,
  }));
}

export interface AdminAdAccount {
  id: string;
  metaAccountId: string;
  name: string;
  source: AdAccountRow["source"];
  currency: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

export interface AdminClientLogin {
  id: string;
  fullName: string | null;
}

export interface AdminClientDetail {
  client: { id: string; name: string; slug: string; logoUrl: string | null };
  adAccounts: AdminAdAccount[];
  logins: AdminClientLogin[];
}

/** Full detail for one client's admin page, looked up by slug. */
export async function getAdminClientDetail(
  slug: string,
): Promise<AdminClientDetail | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = createAdminClient();

  const { data: clientRows } = await admin
    .from("clients")
    .select("id, name, slug, logo_url")
    .eq("slug", slug)
    .limit(1);
  const client = (clientRows as Pick<ClientRow, "id" | "name" | "slug" | "logo_url">[] | null)?.[0];
  if (!client) return null;

  const { data: accountRows } = await admin
    .from("ad_accounts")
    .select("id, meta_account_id, name, source, currency, status")
    .eq("client_id", client.id)
    .order("created_at", { ascending: true });

  const accounts =
    (accountRows as Pick<
      AdAccountRow,
      "id" | "meta_account_id" | "name" | "source" | "currency" | "status"
    >[] | null) ?? [];

  // Latest sync_log row per account (for "last sync time"). Pull recent rows
  // and keep the newest per ad_account_id.
  const accountIds = accounts.map((a) => a.id);
  const lastSync = new Map<string, { at: string; status: string }>();
  if (accountIds.length > 0) {
    const { data: logs } = await admin
      .from("sync_log")
      .select("ad_account_id, started_at, finished_at, status")
      .in("ad_account_id", accountIds)
      .order("started_at", { ascending: false })
      .limit(200);
    for (const l of (logs as Partial<SyncLogRow>[] | null) ?? []) {
      const id = String(l.ad_account_id);
      if (!lastSync.has(id)) {
        lastSync.set(id, {
          at: String(l.finished_at ?? l.started_at ?? ""),
          status: String(l.status ?? ""),
        });
      }
    }
  }

  const { data: loginRows } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "client")
    .eq("client_id", client.id);

  return {
    client: {
      id: client.id,
      name: client.name,
      slug: client.slug,
      logoUrl: client.logo_url,
    },
    adAccounts: accounts.map((a) => ({
      id: a.id,
      metaAccountId: a.meta_account_id,
      name: a.name,
      source: a.source,
      currency: a.currency,
      status: a.status,
      lastSyncAt: lastSync.get(a.id)?.at || null,
      lastSyncStatus: lastSync.get(a.id)?.status || null,
    })),
    logins: ((loginRows as Pick<ProfileRow, "id" | "full_name">[] | null) ?? []).map(
      (p) => ({ id: p.id, fullName: p.full_name }),
    ),
  };
}

export interface TrackedConversionSummary {
  id: string;
  actionType: string;
  displayName: string;
  isEnabled: boolean;
  displayOrder: number;
  metaName: string | null;
  customConversionId: string | null;
}

/**
 * All discovered tracked_conversions for one ad account, oldest discovered
 * first then enabled rows on top. Used by the per-account picker UI.
 */
export async function getTrackedConversionsForAccount(
  adAccountId: string,
): Promise<TrackedConversionSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tracked_conversions")
    .select(
      "id, action_type, display_name, is_enabled, display_order, meta_name, custom_conversion_id, first_seen_at",
    )
    .eq("ad_account_id", adAccountId)
    .order("is_enabled", { ascending: false })
    .order("display_order", { ascending: true })
    .order("display_name", { ascending: true });
  if (error || !data) return [];

  return (
    data as Pick<
      TrackedConversionRow,
      | "id"
      | "action_type"
      | "display_name"
      | "is_enabled"
      | "display_order"
      | "meta_name"
      | "custom_conversion_id"
    >[]
  ).map((r) => ({
    id: r.id,
    actionType: r.action_type,
    displayName: r.display_name,
    isEnabled: r.is_enabled,
    displayOrder: r.display_order,
    metaName: r.meta_name,
    customConversionId: r.custom_conversion_id,
  }));
}
