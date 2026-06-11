import "server-only";

// Background sync job: pulls Meta insights for each ad account and caches them
// in Supabase (metrics_daily + campaign_metrics_daily), recording each run in
// sync_log. Always uses the service-role admin client (RLS-bypassing). Errors
// are caught PER ACCOUNT so one bad account never kills the whole batch.

import { createAdminClient } from "./supabase/admin";
import { decryptSecret } from "./crypto";
import type {
  AdAccountRow,
  BusinessManagerRow,
  ClientRow,
  SyncLogRow,
  MetricsDailyRow,
  CampaignMetricsDailyRow,
  ConversionMetricsDailyRow,
  ConversionMetricsCampaignDailyRow,
  TrackedConversionRow,
} from "./supabase/db.types";
import {
  buildMetaConfig,
  fetchAccountDailyRows,
  fetchCampaignRows,
  fetchAccountConversionDailyRows,
  fetchCampaignConversionRows,
  fetchCustomConversions,
  type DateRange,
  type MetaCustomConversion,
} from "./meta";

// How many days back each kind of run pulls.
export const INCREMENTAL_DAYS = 3; // routine cron refresh (catch late conversions)
export const BACKFILL_DAYS = 90; // first-time full backfill for a new account

// Supabase upserts in chunks to stay well under any payload limits.
const UPSERT_CHUNK = 500;

export interface SyncResult {
  adAccountId: string;
  metaAccountId: string;
  status: "success" | "error" | "skipped";
  rowsWritten: number;
  error?: string;
}

export interface SyncSummary {
  ranAt: string;
  days: number;
  accounts: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalRowsWritten: number;
  results: SyncResult[];
}

// Returns {since, until} in YYYY-MM-DD spanning the last `days` days (inclusive
// of today). Uses UTC so it matches Meta's default account reporting boundary
// closely enough for a cache; exact TZ alignment is handled by re-pulling a
// rolling window on every incremental run.
function lastNDaysRange(days: number): DateRange {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

// The hand-written Database type (db.types.ts) is intentionally minimal, so
// postgrest-js infers `never` for Insert/Update payloads. We type the payloads
// against the Row types ourselves (below) and cast only at the postgrest call
// boundary, keeping every call site fully type-checked.
type MetricsDailyInsert = Omit<MetricsDailyRow, "id">;
type CampaignMetricsDailyInsert = Omit<CampaignMetricsDailyRow, "id">;
type ConversionMetricsDailyInsert = Omit<ConversionMetricsDailyRow, "id">;
type ConversionMetricsCampaignDailyInsert = Omit<ConversionMetricsCampaignDailyRow, "id">;
type TrackedConversionInsert = Omit<TrackedConversionRow, "id" | "first_seen_at" | "updated_at"> & {
  first_seen_at?: string;
  updated_at?: string;
};
type SyncLogInsert = Omit<SyncLogRow, "id" | "finished_at" | "error"> & {
  finished_at?: string | null;
  error?: string | null;
};
type SyncLogUpdate = Partial<Omit<SyncLogRow, "id">>;

async function upsertChunked(
  table: "metrics_daily",
  rows: MetricsDailyInsert[],
  onConflict: string,
): Promise<void>;
async function upsertChunked(
  table: "campaign_metrics_daily",
  rows: CampaignMetricsDailyInsert[],
  onConflict: string,
): Promise<void>;
async function upsertChunked(
  table: "conversion_metrics_daily",
  rows: ConversionMetricsDailyInsert[],
  onConflict: string,
): Promise<void>;
async function upsertChunked(
  table: "conversion_metrics_campaign_daily",
  rows: ConversionMetricsCampaignDailyInsert[],
  onConflict: string,
): Promise<void>;
async function upsertChunked(
  table:
    | "metrics_daily"
    | "campaign_metrics_daily"
    | "conversion_metrics_daily"
    | "conversion_metrics_campaign_daily",
  rows:
    | MetricsDailyInsert[]
    | CampaignMetricsDailyInsert[]
    | ConversionMetricsDailyInsert[]
    | ConversionMetricsCampaignDailyInsert[],
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) return;
  const admin = createAdminClient();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await admin
      .from(table)
      .upsert(chunk as never, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

// Typed sync_log helpers — payload is type-checked against the Row-derived
// types above, then cast to `never` only at the postgrest boundary (the
// minimal Database type infers `never` for mutation payloads).
async function insertSyncLog(row: SyncLogInsert): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("sync_log")
    .insert(row as never)
    .select("id");
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

async function updateSyncLog(id: string, patch: SyncLogUpdate): Promise<void> {
  const admin = createAdminClient();
  await admin.from("sync_log").update(patch as never).eq("id", id);
}

/**
 * Pick the Meta access token for an agency-owned account.
 *
 * Lookup order:
 *  1. Per-BM token: load the account's client.business_manager_id and decrypt
 *     business_managers.meta_access_token_encrypted with TOKEN_ENCRYPTION_KEY.
 *  2. Fallback: process.env.META_ACCESS_TOKEN (back-compat for setups that
 *     haven't migrated yet — keeps the current SH ACQ flow working).
 *  3. Otherwise: skip with a clear "No Meta token for this BM" message that
 *     bubbles up into sync_log.
 *
 * Client-OAuth accounts (Phase 6) are still skipped — they get their own token
 * per client via OAuth.
 */
async function resolveToken(
  account: AdAccountRow,
): Promise<{ token: string } | { skip: string }> {
  if (account.source !== "agency") {
    return {
      skip: "client_oauth account has no stored token yet (handled in Phase 6).",
    };
  }

  const admin = createAdminClient();

  // 1. Look up the per-BM encrypted token via the account's client.
  const { data: clientRows } = await admin
    .from("clients")
    .select("business_manager_id")
    .eq("id", account.client_id)
    .limit(1);
  const bmId =
    (clientRows as Pick<ClientRow, "business_manager_id">[] | null)?.[0]
      ?.business_manager_id ?? null;

  if (bmId) {
    const { data: bmRows } = await admin
      .from("business_managers")
      .select("meta_access_token_encrypted")
      .eq("id", bmId)
      .limit(1);
    const encrypted =
      (bmRows as Pick<BusinessManagerRow, "meta_access_token_encrypted">[] | null)?.[0]
        ?.meta_access_token_encrypted ?? null;
    if (encrypted) {
      try {
        const token = decryptSecret(encrypted);
        if (token) return { token };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          skip: `Could not decrypt per-BM Meta token: ${message}. Re-save the token in /admin/business-managers.`,
        };
      }
    }
  }

  // 2. Fallback to the legacy shared env token (back-compat).
  const envToken = process.env.META_ACCESS_TOKEN;
  if (envToken) return { token: envToken };

  // 3. Nothing available.
  return { skip: "No Meta token for this BM" };
}

// Friendly default for the display_name shown in the picker / KPI tile.
// Strips the common Meta prefixes and title-cases the remainder.
function friendlyDisplayName(actionType: string): string {
  const stripped = actionType
    .replace(/^offsite_conversion\./, "")
    .replace(/^onsite_conversion\./, "")
    .replace(/^omni_/, "")
    .replace(/^fb_pixel_/, "")
    .replace(/^custom\./, "")
    .replace(/_/g, " ")
    .trim();
  if (!stripped) return actionType;
  return stripped.replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Discover-or-preserve tracked_conversions rows.
 *
 * For each distinct action_type we saw in this sync (plus every custom
 * conversion the account exposes), upsert a tracked_conversions row keyed by
 * (ad_account_id, action_type). ON CONFLICT we ONLY refresh `meta_name`,
 * `custom_conversion_id` and `updated_at` — `is_enabled`, `display_name` and
 * `display_order` are NEVER overwritten so the admin's picker choices stay put.
 */
async function discoverTrackedConversions(
  adAccountId: string,
  actionTypes: Set<string>,
  customConversions: MetaCustomConversion[],
): Promise<number> {
  if (actionTypes.size === 0 && customConversions.length === 0) return 0;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Map custom_conversion_id (numeric Meta id) → MetaCustomConversion.
  // Their action_type in insights looks like "offsite_conversion.custom.<id>".
  const customById = new Map<string, MetaCustomConversion>();
  for (const c of customConversions) customById.set(c.id, c);
  const customActionType = (id: string) => `offsite_conversion.custom.${id}`;

  // 1. Existing rows for this account so we don't trample admin picks.
  const { data: existingRows } = await admin
    .from("tracked_conversions")
    .select("action_type")
    .eq("ad_account_id", adAccountId);
  const existing = new Set(
    ((existingRows as Pick<TrackedConversionRow, "action_type">[] | null) ?? []).map(
      (r) => r.action_type,
    ),
  );

  const inserts: TrackedConversionInsert[] = [];

  // From insights breakdown.
  for (const at of actionTypes) {
    if (existing.has(at)) continue;
    // If this is a known custom conversion, prefer its Meta name.
    let displayName = friendlyDisplayName(at);
    let customConversionId: string | null = null;
    let metaName: string | null = null;
    const m = /^offsite_conversion\.custom\.(\d+)$/.exec(at);
    if (m && customById.has(m[1])) {
      const cc = customById.get(m[1])!;
      displayName = cc.name;
      customConversionId = cc.id;
      metaName = cc.name;
    }
    inserts.push({
      ad_account_id: adAccountId,
      action_type: at,
      display_name: displayName,
      is_enabled: false,
      display_order: 0,
      custom_conversion_id: customConversionId,
      meta_name: metaName,
      first_seen_at: now,
      updated_at: now,
    });
  }

  // From customconversions edge (may include zero-traffic conversions
  // that never show up in insights yet — still worth surfacing in the picker).
  for (const cc of customConversions) {
    const at = customActionType(cc.id);
    if (existing.has(at) || actionTypes.has(at)) continue;
    inserts.push({
      ad_account_id: adAccountId,
      action_type: at,
      display_name: cc.name,
      is_enabled: false,
      display_order: 0,
      custom_conversion_id: cc.id,
      meta_name: cc.name,
      first_seen_at: now,
      updated_at: now,
    });
  }

  if (inserts.length === 0) return 0;

  // Insert with ON CONFLICT DO NOTHING so concurrent syncs and existing
  // admin choices stay safe. supabase-js upsert with ignoreDuplicates=true.
  const { error } = await admin
    .from("tracked_conversions")
    .upsert(inserts as never, {
      onConflict: "ad_account_id,action_type",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`tracked_conversions upsert failed: ${error.message}`);

  return inserts.length;
}

/**
 * Sync ONE ad account: fetch the last `days` of daily + per-campaign rows from
 * Meta, upsert into the cache, and write a sync_log row. Never throws — always
 * returns a SyncResult and records the outcome in sync_log.
 */
export async function syncAdAccount(
  account: AdAccountRow,
  opts: { days?: number } = {},
): Promise<SyncResult> {
  const days = opts.days ?? INCREMENTAL_DAYS;
  const startedAt = new Date().toISOString();

  const base: SyncResult = {
    adAccountId: account.id,
    metaAccountId: account.meta_account_id,
    status: "success",
    rowsWritten: 0,
  };

  const tokenOrSkip = await resolveToken(account);
  if ("skip" in tokenOrSkip) {
    // Record the skip in sync_log so the reason is visible in the UI later.
    await insertSyncLog({
      ad_account_id: account.id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "skipped",
      rows_written: 0,
      error: tokenOrSkip.skip,
    });
    return { ...base, status: "skipped", error: tokenOrSkip.skip };
  }

  // Open a "running" log row so an in-flight (or crashed) sync is observable.
  const logId = await insertSyncLog({
    ad_account_id: account.id,
    started_at: startedAt,
    status: "running",
    rows_written: 0,
  });

  try {
    const cfg = buildMetaConfig({
      token: tokenOrSkip.token,
      accountId: account.meta_account_id,
    });
    const range = lastNDaysRange(days);

    const [
      dailyRows,
      campaignRows,
      conversionDailyRows,
      conversionCampaignRows,
      customConversions,
    ] = await Promise.all([
      fetchAccountDailyRows(cfg, range),
      fetchCampaignRows(cfg, range),
      fetchAccountConversionDailyRows(cfg, range),
      fetchCampaignConversionRows(cfg, range),
      fetchCustomConversions(cfg).catch(() => [] as MetaCustomConversion[]),
    ]);

    const now = new Date().toISOString();

    const dailyUpserts: MetricsDailyInsert[] = dailyRows.map((r) => ({
      ad_account_id: account.id,
      date: r.date,
      spend: r.spend,
      clicks: r.clicks,
      impressions: r.impressions,
      reach: r.reach,
      leads: r.leads,
      schedules: r.schedules,
      revenue: r.revenue,
      updated_at: now,
    }));

    const campaignUpserts: CampaignMetricsDailyInsert[] = campaignRows.map((r) => ({
      ad_account_id: account.id,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      status: r.status,
      date: r.date,
      spend: r.spend,
      clicks: r.clicks,
      impressions: r.impressions,
      reach: r.reach,
      leads: r.leads,
      schedules: r.schedules,
      revenue: r.revenue,
      updated_at: now,
    }));

    const conversionUpserts: ConversionMetricsDailyInsert[] = conversionDailyRows.map(
      (r) => ({
        ad_account_id: account.id,
        action_type: r.actionType,
        date: r.date,
        count: r.count,
        value: r.value,
        updated_at: now,
      }),
    );

    const conversionCampaignUpserts: ConversionMetricsCampaignDailyInsert[] =
      conversionCampaignRows.map((r) => ({
        ad_account_id: account.id,
        campaign_id: r.campaign_id,
        action_type: r.actionType,
        date: r.date,
        count: r.count,
        value: r.value,
        updated_at: now,
      }));

    await upsertChunked("metrics_daily", dailyUpserts, "ad_account_id,date");
    await upsertChunked(
      "campaign_metrics_daily",
      campaignUpserts,
      "ad_account_id,campaign_id,date",
    );
    await upsertChunked(
      "conversion_metrics_daily",
      conversionUpserts,
      "ad_account_id,action_type,date",
    );
    await upsertChunked(
      "conversion_metrics_campaign_daily",
      conversionCampaignUpserts,
      "ad_account_id,campaign_id,action_type,date",
    );

    // Auto-discover any new action_types into tracked_conversions. Admin's
    // is_enabled / display_name picks are preserved on conflict.
    const discoveredTypes = new Set<string>();
    for (const r of conversionDailyRows) discoveredTypes.add(r.actionType);
    const trackedInserted = await discoverTrackedConversions(
      account.id,
      discoveredTypes,
      customConversions,
    );

    const rowsWritten =
      dailyUpserts.length +
      campaignUpserts.length +
      conversionUpserts.length +
      conversionCampaignUpserts.length +
      trackedInserted;
    const finishedAt = new Date().toISOString();

    if (logId) {
      await updateSyncLog(logId, {
        finished_at: finishedAt,
        status: "success",
        rows_written: rowsWritten,
      });
    }

    return { ...base, status: "success", rowsWritten };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    const finishedAt = new Date().toISOString();
    if (logId) {
      await updateSyncLog(logId, {
        finished_at: finishedAt,
        status: "error",
        error: message,
      });
    } else {
      await insertSyncLog({
        ad_account_id: account.id,
        started_at: startedAt,
        finished_at: finishedAt,
        status: "error",
        rows_written: 0,
        error: message,
      });
    }
    return { ...base, status: "error", error: message };
  }
}

/**
 * Load all active agency-owned ad accounts and sync each. Failures are
 * isolated per account. Returns a summary suitable for a JSON cron response.
 */
export async function syncAllAgencyAccounts(
  opts: { days?: number } = {},
): Promise<SyncSummary> {
  const days = opts.days ?? INCREMENTAL_DAYS;
  const admin = createAdminClient();
  const ranAt = new Date().toISOString();

  const { data, error } = await admin
    .from("ad_accounts")
    .select("*")
    .eq("source", "agency")
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to load ad_accounts: ${error.message}`);
  }

  const accounts = (data ?? []) as AdAccountRow[];
  const results: SyncResult[] = [];
  for (const account of accounts) {
    results.push(await syncAdAccount(account, { days }));
  }

  return {
    ranAt,
    days,
    accounts: accounts.length,
    succeeded: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    totalRowsWritten: results.reduce((s, r) => s + r.rowsWritten, 0),
    results,
  };
}

/**
 * Backfill a single account by uuid (used in Phase 5 when an account is first
 * added). Defaults to BACKFILL_DAYS. Returns null if the account isn't found.
 */
export async function backfillAdAccount(
  adAccountId: string,
  opts: { days?: number } = {},
): Promise<SyncResult | null> {
  const days = opts.days ?? BACKFILL_DAYS;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_accounts")
    .select("*")
    .eq("id", adAccountId)
    .limit(1);

  if (error) throw new Error(`Failed to load ad_account: ${error.message}`);
  const account = (data?.[0] as AdAccountRow | undefined) ?? null;
  if (!account) return null;

  return syncAdAccount(account, { days });
}
