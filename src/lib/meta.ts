import type { Campaign, DailyMetric, DashboardData, Totals } from "./types";

// ---- Meta Marketing API integration --------------------------------------
// Pulls the last 30 days of insights from the Meta (Facebook) Graph API and
// maps them into the dashboard's DashboardData shape. Leads / schedules /
// revenue come from `actions` and `action_values`, whose action_type names
// depend on how the ad account's pixel + conversions are configured — so the
// event names are configurable via env vars (see .env.local.example).

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface MetaConfig {
  token: string;
  accountId: string; // e.g. "act_1234567890"
  fxGbpToUsd: number;
  leadActionTypes: string[];
  scheduleActionTypes: string[];
  purchaseActionTypes: string[];
}

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  clicks?: string;
  impressions?: string;
  reach?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

// Default Meta conversion event names. Shared by readMetaConfigFromEnv and
// buildMetaConfig so per-account configs match the env-based demo behaviour.
const DEFAULT_LEAD_ACTIONS = [
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
];
const DEFAULT_SCHEDULE_ACTIONS = [
  "schedule",
  "offsite_conversion.fb_pixel_schedule",
  "onsite_conversion.schedule_total",
];
const DEFAULT_PURCHASE_ACTIONS = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
];

function envActionTypes(v: string | undefined, fallback: string[]): string[] {
  return v
    ? v.split(",").map((s) => s.trim()).filter(Boolean)
    : fallback;
}

/**
 * Build a MetaConfig for a SPECIFIC account + token (used by the per-account
 * sync job, where each ad account brings its own token). Action-type lists
 * default to the standard pixel events but can be overridden per call.
 * The action-type defaults still honour the META_*_ACTIONS env overrides so a
 * single global override config keeps working in both code paths.
 */
export function buildMetaConfig(opts: {
  token: string;
  accountId: string;
  fxGbpToUsd?: number;
  leadActionTypes?: string[];
  scheduleActionTypes?: string[];
  purchaseActionTypes?: string[];
}): MetaConfig {
  return {
    token: opts.token,
    accountId: opts.accountId.startsWith("act_")
      ? opts.accountId
      : `act_${opts.accountId}`,
    fxGbpToUsd: opts.fxGbpToUsd ?? Number(process.env.META_FX_GBP_TO_USD ?? "1.27"),
    leadActionTypes:
      opts.leadActionTypes ??
      envActionTypes(process.env.META_LEAD_ACTIONS, DEFAULT_LEAD_ACTIONS),
    scheduleActionTypes:
      opts.scheduleActionTypes ??
      envActionTypes(process.env.META_SCHEDULE_ACTIONS, DEFAULT_SCHEDULE_ACTIONS),
    purchaseActionTypes:
      opts.purchaseActionTypes ??
      envActionTypes(process.env.META_PURCHASE_ACTIONS, DEFAULT_PURCHASE_ACTIONS),
  };
}

export function readMetaConfigFromEnv(): MetaConfig | null {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return null;
  return buildMetaConfig({ token, accountId });
}

function sumActions(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((s, a) => s + Number(a.value || 0), 0);
}

// Follows paging.next and returns every data row across all pages.
async function fetchAllRows(url: string): Promise<MetaInsightRow[]> {
  const rows: MetaInsightRow[] = [];
  let next: string | null = url;
  while (next) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json: {
      data?: MetaInsightRow[];
      paging?: { next?: string };
      error?: { message?: string };
    } = await res.json();
    if (!res.ok) {
      const msg = json?.error?.message || `Meta API error (HTTP ${res.status})`;
      throw new Error(msg);
    }
    if (Array.isArray(json.data)) rows.push(...json.data);
    next = json.paging?.next ?? null;
  }
  return rows;
}

function mapDaily(rows: MetaInsightRow[], cfg: MetaConfig): DailyMetric[] {
  return rows
    .filter((r) => r.date_start)
    .map((r) => ({
      date: r.date_start as string,
      spendGbp: Number(r.spend || 0),
      clicks: Number(r.clicks || 0),
      leads: sumActions(r.actions, cfg.leadActionTypes),
      schedules: sumActions(r.actions, cfg.scheduleActionTypes),
      reach: Number(r.reach || 0),
      impressions: Number(r.impressions || 0),
      revenueUsd: sumActions(r.action_values, cfg.purchaseActionTypes) * cfg.fxGbpToUsd,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildTotals(daily: DailyMetric[], fx: number): Totals {
  const acc = daily.reduce(
    (t, d) => {
      t.spendGbp += d.spendGbp;
      t.clicks += d.clicks;
      t.leads += d.leads;
      t.schedules += d.schedules;
      t.reach += d.reach;
      t.impressions += d.impressions;
      t.revenueUsd += d.revenueUsd;
      return t;
    },
    { spendGbp: 0, clicks: 0, leads: 0, schedules: 0, reach: 0, impressions: 0, revenueUsd: 0 }
  );
  const spendUsd = acc.spendGbp * fx;
  return {
    ...acc,
    spendUsd,
    cpc: acc.clicks ? acc.spendGbp / acc.clicks : 0,
    cpl: acc.leads ? acc.spendGbp / acc.leads : 0,
    costPerSchedule: acc.schedules ? acc.spendGbp / acc.schedules : 0,
    convRate: acc.clicks ? acc.leads / acc.clicks : 0,
    ctr: acc.impressions ? acc.clicks / acc.impressions : 0,
    roas: spendUsd ? acc.revenueUsd / spendUsd : 0,
    conversionTotals: {},
    costPerConversion: {},
  };
}

async function fetchCampaignStatuses(cfg: MetaConfig): Promise<Map<string, Campaign["status"]>> {
  const url =
    `${GRAPH}/${cfg.accountId}/campaigns` +
    `?fields=id,effective_status&limit=200&access_token=${encodeURIComponent(cfg.token)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  const map = new Map<string, Campaign["status"]>();
  if (res.ok && Array.isArray(json.data)) {
    for (const c of json.data) {
      map.set(c.id, c.effective_status === "ACTIVE" ? "Active" : "Paused");
    }
  }
  return map;
}

function mapCampaigns(
  rows: MetaInsightRow[],
  cfg: MetaConfig,
  statuses: Map<string, Campaign["status"]>
): Campaign[] {
  return rows
    .filter((r) => r.campaign_id)
    .map((r) => ({
      id: r.campaign_id as string,
      name: r.campaign_name || r.campaign_id || "Unnamed",
      status: statuses.get(r.campaign_id as string) ?? "Active",
      spendGbp: Number(r.spend || 0),
      clicks: Number(r.clicks || 0),
      leads: sumActions(r.actions, cfg.leadActionTypes),
      schedules: sumActions(r.actions, cfg.scheduleActionTypes),
      reach: Number(r.reach || 0),
      impressions: Number(r.impressions || 0),
      revenueUsd: sumActions(r.action_values, cfg.purchaseActionTypes) * cfg.fxGbpToUsd,
    }))
    .sort((a, b) => b.spendGbp - a.spendGbp);
}

// ---- Lower-level normalized rows (for the DB sync cache) ------------------
// These return the *raw account-currency* numbers — NO FX multiply. `spend`
// and `revenue` are in the ad account's own currency; the dashboard layer
// converts to GBP/USD for display. Column names mirror metrics_daily /
// campaign_metrics_daily in db.types.ts so the sync job can upsert directly.

export interface NormalizedDailyRow {
  date: string; // yyyy-mm-dd
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  leads: number;
  schedules: number;
  revenue: number;
}

export interface NormalizedCampaignRow extends NormalizedDailyRow {
  campaign_id: string;
  campaign_name: string;
  status: string; // 'Active' | 'Paused'
}

export interface DateRange {
  since: string; // yyyy-mm-dd
  until: string; // yyyy-mm-dd
}

function timeRangeParam(range: DateRange): string {
  const tr = JSON.stringify({ since: range.since, until: range.until });
  return `time_range=${encodeURIComponent(tr)}`;
}

function normalizeRow(r: MetaInsightRow, cfg: MetaConfig, date: string): NormalizedDailyRow {
  return {
    date,
    spend: Number(r.spend || 0),
    clicks: Number(r.clicks || 0),
    impressions: Number(r.impressions || 0),
    reach: Number(r.reach || 0),
    leads: sumActions(r.actions, cfg.leadActionTypes),
    schedules: sumActions(r.actions, cfg.scheduleActionTypes),
    // Raw action_value sum in account currency — no FX multiply (see note above).
    revenue: sumActions(r.action_values, cfg.purchaseActionTypes),
  };
}

/**
 * Account-level daily rows over an explicit date range (time_increment=1).
 * One row per day. Numbers are raw account-currency values.
 */
export async function fetchAccountDailyRows(
  cfg: MetaConfig,
  range: DateRange,
): Promise<NormalizedDailyRow[]> {
  const fields = "spend,clicks,impressions,reach,actions,action_values";
  const auth = `access_token=${encodeURIComponent(cfg.token)}`;
  const url =
    `${GRAPH}/${cfg.accountId}/insights` +
    `?level=account&time_increment=1&${timeRangeParam(range)}` +
    `&fields=${fields}&limit=500&${auth}`;

  const rows = await fetchAllRows(url);
  return rows
    .filter((r) => r.date_start)
    .map((r) => normalizeRow(r, cfg, r.date_start as string))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Per-campaign DAILY rows over a date range (time_increment=1) so the date
 * picker works on the cached data. DECISION: we request daily per-campaign
 * rows (one row per campaign per day) rather than per-campaign totals — this
 * keeps campaign_metrics_daily queryable by date. Each row's `date` is the
 * Meta date_start. Campaign status comes from the campaigns endpoint.
 */
export async function fetchCampaignRows(
  cfg: MetaConfig,
  range: DateRange,
): Promise<NormalizedCampaignRow[]> {
  const fields = "spend,clicks,impressions,reach,actions,action_values";
  const auth = `access_token=${encodeURIComponent(cfg.token)}`;
  const url =
    `${GRAPH}/${cfg.accountId}/insights` +
    `?level=campaign&time_increment=1&${timeRangeParam(range)}` +
    `&fields=campaign_id,campaign_name,${fields}&limit=500&${auth}`;

  const [rows, statuses] = await Promise.all([
    fetchAllRows(url),
    fetchCampaignStatuses(cfg),
  ]);

  return rows
    .filter((r) => r.campaign_id && r.date_start)
    .map((r) => ({
      ...normalizeRow(r, cfg, r.date_start as string),
      campaign_id: r.campaign_id as string,
      campaign_name: r.campaign_name || (r.campaign_id as string),
      status: statuses.get(r.campaign_id as string) ?? "Active",
    }));
}

// ---- Per-action_type conversion breakdowns -------------------------------
// These return ONE row per (date, action_type) [or (date, campaign_id,
// action_type)] so the sync layer can persist a complete breakdown without
// pre-committing to which conversions to surface. The admin's
// tracked_conversions picker decides which ones the dashboard renders.

export interface NormalizedConversionRow {
  date: string;
  actionType: string;
  count: number;
  value: number;
}

export interface NormalizedCampaignConversionRow extends NormalizedConversionRow {
  campaign_id: string;
}

function explodeConversionRow(
  r: MetaInsightRow,
  date: string,
): NormalizedConversionRow[] {
  const out = new Map<string, NormalizedConversionRow>();
  for (const a of r.actions ?? []) {
    if (!a.action_type) continue;
    const existing = out.get(a.action_type) ?? { date, actionType: a.action_type, count: 0, value: 0 };
    existing.count += Number(a.value || 0);
    out.set(a.action_type, existing);
  }
  for (const a of r.action_values ?? []) {
    if (!a.action_type) continue;
    const existing = out.get(a.action_type) ?? { date, actionType: a.action_type, count: 0, value: 0 };
    existing.value += Number(a.value || 0);
    out.set(a.action_type, existing);
  }
  return Array.from(out.values());
}

/**
 * Account-level per-(date, action_type) breakdown over a date range.
 * One row per (date, action_type) across both actions[] and action_values[].
 */
export async function fetchAccountConversionDailyRows(
  cfg: MetaConfig,
  range: DateRange,
): Promise<NormalizedConversionRow[]> {
  const fields = "actions,action_values";
  const auth = `access_token=${encodeURIComponent(cfg.token)}`;
  const url =
    `${GRAPH}/${cfg.accountId}/insights` +
    `?level=account&time_increment=1&${timeRangeParam(range)}` +
    `&fields=${fields}&limit=500&${auth}`;

  const rows = await fetchAllRows(url);
  const out: NormalizedConversionRow[] = [];
  for (const r of rows) {
    if (!r.date_start) continue;
    out.push(...explodeConversionRow(r, r.date_start));
  }
  return out;
}

/**
 * Per-campaign per-(date, action_type) breakdown over a date range.
 */
export async function fetchCampaignConversionRows(
  cfg: MetaConfig,
  range: DateRange,
): Promise<NormalizedCampaignConversionRow[]> {
  const fields = "actions,action_values";
  const auth = `access_token=${encodeURIComponent(cfg.token)}`;
  const url =
    `${GRAPH}/${cfg.accountId}/insights` +
    `?level=campaign&time_increment=1&${timeRangeParam(range)}` +
    `&fields=campaign_id,${fields}&limit=500&${auth}`;

  const rows = await fetchAllRows(url);
  const out: NormalizedCampaignConversionRow[] = [];
  for (const r of rows) {
    if (!r.date_start || !r.campaign_id) continue;
    for (const c of explodeConversionRow(r, r.date_start)) {
      out.push({ ...c, campaign_id: r.campaign_id });
    }
  }
  return out;
}

export interface MetaCustomConversion {
  id: string;
  name: string;
  custom_event_type: string | null;
}

interface MetaCustomConversionApiRow {
  id?: string;
  name?: string;
  custom_event_type?: string | null;
}

/**
 * List Meta Custom Conversions defined for the ad account. Used by the sync
 * to auto-discover named conversions and seed tracked_conversions entries.
 */
export async function fetchCustomConversions(
  cfg: MetaConfig,
): Promise<MetaCustomConversion[]> {
  const auth = `access_token=${encodeURIComponent(cfg.token)}`;
  const url =
    `${GRAPH}/${cfg.accountId}/customconversions` +
    `?fields=id,name,custom_event_type,event_source_type&limit=200&${auth}`;

  const out: MetaCustomConversion[] = [];
  let next: string | null = url;
  while (next) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const json: {
      data?: MetaCustomConversionApiRow[];
      paging?: { next?: string };
      error?: { message?: string };
    } = await res.json();
    if (!res.ok) {
      // Don't blow up the whole sync if customconversions isn't available
      // (some tokens lack ads_read on this edge). Just return what we have.
      return out;
    }
    for (const r of json.data ?? []) {
      if (!r.id || !r.name) continue;
      out.push({
        id: r.id,
        name: r.name,
        custom_event_type: r.custom_event_type ?? null,
      });
    }
    next = json.paging?.next ?? null;
  }
  return out;
}

export async function fetchMetaDashboard(cfg: MetaConfig): Promise<DashboardData> {
  const fields = "spend,clicks,impressions,reach,actions,action_values";
  const base = `${GRAPH}/${cfg.accountId}/insights`;
  const auth = `access_token=${encodeURIComponent(cfg.token)}`;

  const dailyUrl = `${base}?level=account&time_increment=1&date_preset=last_30d&fields=${fields}&limit=500&${auth}`;
  const campaignUrl = `${base}?level=campaign&date_preset=last_30d&fields=campaign_id,campaign_name,${fields}&limit=500&${auth}`;

  const [dailyRows, campaignRows, statuses] = await Promise.all([
    fetchAllRows(dailyUrl),
    fetchAllRows(campaignUrl),
    fetchCampaignStatuses(cfg),
  ]);

  const daily = mapDaily(dailyRows, cfg);
  if (daily.length === 0) {
    throw new Error("Meta API returned no insights for the last 30 days for this ad account.");
  }

  return {
    source: "live",
    fxGbpToUsd: cfg.fxGbpToUsd,
    rangeStart: daily[0].date,
    rangeEnd: daily[daily.length - 1].date,
    daily,
    campaigns: mapCampaigns(campaignRows, cfg, statuses),
    totals: buildTotals(daily, cfg.fxGbpToUsd),
    trackedConversions: [],
  };
}
