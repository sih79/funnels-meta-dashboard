import "server-only";

// Background sync job: pulls Meta insights for each ad account and caches them
// in Supabase (metrics_daily + campaign_metrics_daily), recording each run in
// sync_log. Always uses the service-role admin client (RLS-bypassing). Errors
// are caught PER ACCOUNT so one bad account never kills the whole batch.

import { createAdminClient } from "./supabase/admin";
import type {
  AdAccountRow,
  SyncLogRow,
  MetricsDailyRow,
  CampaignMetricsDailyRow,
} from "./supabase/db.types";
import {
  buildMetaConfig,
  fetchAccountDailyRows,
  fetchCampaignRows,
  type DateRange,
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
  table: "metrics_daily" | "campaign_metrics_daily",
  rows: MetricsDailyInsert[] | CampaignMetricsDailyInsert[],
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
 * Pick the Meta access token for an account. Agency-owned accounts use the
 * shared system-user token in META_ACCESS_TOKEN. Client-OAuth accounts have no
 * token until Phase 6 (per-client OAuth) — so we skip them with a clear note.
 */
function resolveToken(account: AdAccountRow): { token: string } | { skip: string } {
  if (account.source === "agency") {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) {
      return { skip: "No META_ACCESS_TOKEN set for agency accounts." };
    }
    return { token };
  }
  // 'client_oauth'
  return {
    skip: "client_oauth account has no stored token yet (handled in Phase 6).",
  };
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

  const tokenOrSkip = resolveToken(account);
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

    const [dailyRows, campaignRows] = await Promise.all([
      fetchAccountDailyRows(cfg, range),
      fetchCampaignRows(cfg, range),
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

    await upsertChunked("metrics_daily", dailyUpserts, "ad_account_id,date");
    await upsertChunked(
      "campaign_metrics_daily",
      campaignUpserts,
      "ad_account_id,campaign_id,date",
    );

    const rowsWritten = dailyUpserts.length + campaignUpserts.length;
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
