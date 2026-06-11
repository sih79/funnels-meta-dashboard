import "server-only";

// Server-only data-access layer for the multi-client dashboards.
//
// Reads the CACHE (Supabase) — never the live Meta API — and aggregates rows
// into the existing DashboardData / Totals / DailyMetric / Campaign shapes the
// presentational components already expect. The sync robot (Phase 3) keeps the
// cache fresh; this layer just reads + aggregates it.
//
// Conversions: rather than fixed leads/schedules KPIs, the dashboard renders
// whichever tracked_conversions the admin has enabled for the client's ad
// accounts. We aggregate from conversion_metrics_daily for ENABLED conversions
// only. The legacy leads/schedules columns on DailyMetric stay populated as
// 0 for back-compat — components that still reference them get a zero,
// components that use `conversions` get real data.
//
// Access control: every read goes through the user's own server client, so RLS
// automatically filters to rows the user may see (staff: all; client: own
// client_id). We ALSO scope queries explicitly (by client_id / ad_account_id)
// for clarity and so a client user can never even name another client's data.

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getProfile } from "@/lib/auth";
import type {
  AdAccountRow,
  ClientRow,
  MetricsDailyRow,
  CampaignMetricsDailyRow,
  ConversionMetricsDailyRow,
  ConversionMetricsCampaignDailyRow,
  TrackedConversionRow,
} from "@/lib/supabase/db.types";
import type {
  Campaign,
  DailyMetric,
  DashboardData,
  Totals,
  TrackedConversion,
} from "@/lib/types";

// Same default the demo / meta layer use. The DB stores raw account-currency
// spend/revenue; we treat spend as "spendGbp" and revenue as USD-after-FX so
// the existing components (which compute ROAS = revenueUsd / (spendGbp * fx))
// render unchanged.
const FX_GBP_TO_USD = Number(process.env.META_FX_GBP_TO_USD ?? "1.27");

/** Minimal client identity used to drive the staff tabs + dashboard headers. */
export interface AccessibleClient {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

// Coerce a Postgres numeric (which supabase-js may return as a string) to a
// finite number, defaulting to 0.
function n(value: unknown): number {
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * The clients the current user may see.
 * - staff/admin: every client (RLS allows all).
 * - client user: just the one referenced by their profile.client_id.
 * Returns [] when Supabase isn't configured or there's no signed-in profile.
 */
export async function getAccessibleClients(): Promise<AccessibleClient[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getProfile();
  if (!profile) return [];

  const supabase = await createClient();

  let query = supabase
    .from("clients")
    .select("id, name, slug, logo_url")
    .order("name", { ascending: true });

  // For a client user, scope explicitly to their own client. RLS would do this
  // too, but being explicit makes intent obvious and is cheap defence-in-depth.
  if (profile.role === "client") {
    if (!profile.client_id) return [];
    query = query.eq("id", profile.client_id);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Pick<ClientRow, "id" | "name" | "slug" | "logo_url">[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    logoUrl: c.logo_url,
  }));
}

/** Look up a single accessible client by slug, or null if not found/allowed. */
export async function getAccessibleClientBySlug(
  slug: string,
): Promise<AccessibleClient | null> {
  const clients = await getAccessibleClients();
  return clients.find((c) => c.slug === slug) ?? null;
}

function buildTotals(
  daily: DailyMetric[],
  fx: number,
  trackedActionTypes: string[],
): Totals {
  const spendGbp = daily.reduce((s, d) => s + d.spendGbp, 0);
  const clicks = daily.reduce((s, d) => s + d.clicks, 0);
  const leads = daily.reduce((s, d) => s + d.leads, 0);
  const schedules = daily.reduce((s, d) => s + d.schedules, 0);
  const reach = daily.reduce((s, d) => s + d.reach, 0);
  const impressions = daily.reduce((s, d) => s + d.impressions, 0);
  const revenueUsd = daily.reduce((s, d) => s + d.revenueUsd, 0);
  const spendUsd = spendGbp * fx;

  const conversionTotals: Record<string, number> = {};
  for (const at of trackedActionTypes) conversionTotals[at] = 0;
  for (const d of daily) {
    if (!d.conversions) continue;
    for (const [at, c] of Object.entries(d.conversions)) {
      conversionTotals[at] = (conversionTotals[at] ?? 0) + c;
    }
  }
  const costPerConversion: Record<string, number> = {};
  for (const [at, c] of Object.entries(conversionTotals)) {
    costPerConversion[at] = c ? spendGbp / c : 0;
  }

  return {
    spendGbp,
    spendUsd,
    clicks,
    leads,
    schedules,
    reach,
    impressions,
    revenueUsd,
    cpc: clicks ? spendGbp / clicks : 0,
    cpl: leads ? spendGbp / leads : 0,
    costPerSchedule: schedules ? spendGbp / schedules : 0,
    convRate: clicks ? leads / clicks : 0,
    ctr: impressions ? clicks / impressions : 0,
    roas: spendUsd ? revenueUsd / spendUsd : 0,
    conversionTotals,
    costPerConversion,
  };
}

function emptyTotals(): Totals {
  return buildTotals([], FX_GBP_TO_USD, []);
}

/**
 * Load + aggregate a client's cached dashboard for a date window.
 *
 * Sums across ALL of the client's ad accounts so multi-account clients see a
 * single combined view (per-account breakdown can be layered on later).
 * Returns null when the client is not in the caller's accessible set (404),
 * and a populated-but-empty DashboardData when there are simply no rows yet.
 */
export async function getClientDashboard(
  clientId: string,
  range: { since: string; until: string },
): Promise<DashboardData | null> {
  if (!isSupabaseConfigured()) return null;

  // Enforce access: the client must be in the caller's accessible set.
  const clients = await getAccessibleClients();
  if (!clients.some((c) => c.id === clientId)) return null;

  const fx = FX_GBP_TO_USD;
  const supabase = await createClient();

  // The client's ad accounts (RLS-scoped; also filtered by client_id).
  const { data: accountRows } = await supabase
    .from("ad_accounts")
    .select("id")
    .eq("client_id", clientId);

  const accountIds = ((accountRows as Pick<AdAccountRow, "id">[] | null) ?? []).map(
    (a) => a.id,
  );

  // No accounts wired up yet → render an empty dashboard rather than erroring.
  if (accountIds.length === 0) {
    return {
      source: "live",
      fxGbpToUsd: fx,
      rangeStart: range.since,
      rangeEnd: range.until,
      daily: [],
      campaigns: [],
      totals: emptyTotals(),
      trackedConversions: [],
    };
  }

  // The admin-enabled tracked conversions for these accounts, ordered.
  const { data: trackedRows } = await supabase
    .from("tracked_conversions")
    .select("action_type, display_name, display_order")
    .in("ad_account_id", accountIds)
    .eq("is_enabled", true)
    .order("display_order", { ascending: true });

  // Collapse duplicates across multiple ad accounts — last write wins for
  // display_name, lowest display_order wins.
  const trackedMap = new Map<string, TrackedConversion>();
  for (const r of (trackedRows as Pick<
    TrackedConversionRow,
    "action_type" | "display_name" | "display_order"
  >[] | null) ?? []) {
    const existing = trackedMap.get(r.action_type);
    if (!existing) {
      trackedMap.set(r.action_type, {
        actionType: r.action_type,
        displayName: r.display_name,
        displayOrder: r.display_order,
      });
    } else if (r.display_order < existing.displayOrder) {
      trackedMap.set(r.action_type, {
        actionType: r.action_type,
        displayName: r.display_name,
        displayOrder: r.display_order,
      });
    }
  }
  const trackedConversions = Array.from(trackedMap.values()).sort(
    (a, b) =>
      a.displayOrder - b.displayOrder || a.displayName.localeCompare(b.displayName),
  );
  const enabledActionTypes = trackedConversions.map((t) => t.actionType);

  // Pull daily + per-campaign rows for the window across all the accounts.
  const [
    { data: metricRows },
    { data: campaignRows },
    { data: conversionDailyRows },
    { data: conversionCampaignRows },
  ] = await Promise.all([
    supabase
      .from("metrics_daily")
      .select("date, spend, clicks, impressions, reach, leads, schedules, revenue")
      .in("ad_account_id", accountIds)
      .gte("date", range.since)
      .lte("date", range.until)
      .order("date", { ascending: true }),
    supabase
      .from("campaign_metrics_daily")
      .select(
        "campaign_id, campaign_name, status, spend, clicks, impressions, reach, leads, schedules, revenue",
      )
      .in("ad_account_id", accountIds)
      .gte("date", range.since)
      .lte("date", range.until),
    enabledActionTypes.length > 0
      ? supabase
          .from("conversion_metrics_daily")
          .select("date, action_type, count")
          .in("ad_account_id", accountIds)
          .in("action_type", enabledActionTypes)
          .gte("date", range.since)
          .lte("date", range.until)
      : Promise.resolve({ data: [] as Partial<ConversionMetricsDailyRow>[] }),
    enabledActionTypes.length > 0
      ? supabase
          .from("conversion_metrics_campaign_daily")
          .select("campaign_id, action_type, count")
          .in("ad_account_id", accountIds)
          .in("action_type", enabledActionTypes)
          .gte("date", range.since)
          .lte("date", range.until)
      : Promise.resolve({ data: [] as Partial<ConversionMetricsCampaignDailyRow>[] }),
  ]);

  const daily = aggregateDaily(
    (metricRows as Partial<MetricsDailyRow>[] | null) ?? [],
    (conversionDailyRows as Partial<ConversionMetricsDailyRow>[] | null) ?? [],
    enabledActionTypes,
    fx,
  );
  const campaigns = aggregateCampaigns(
    (campaignRows as Partial<CampaignMetricsDailyRow>[] | null) ?? [],
    (conversionCampaignRows as Partial<ConversionMetricsCampaignDailyRow>[] | null) ??
      [],
    enabledActionTypes,
    fx,
  );

  return {
    source: "live",
    fxGbpToUsd: fx,
    rangeStart: daily.length ? daily[0].date : range.since,
    rangeEnd: daily.length ? daily[daily.length - 1].date : range.until,
    daily,
    campaigns,
    totals: buildTotals(daily, fx, enabledActionTypes),
    trackedConversions,
  };
}

// Collapse per-account daily rows into one row per date (summing across the
// client's accounts), sorted oldest → newest like the demo data.
function aggregateDaily(
  rows: Partial<MetricsDailyRow>[],
  conversionRows: Partial<ConversionMetricsDailyRow>[],
  enabledActionTypes: string[],
  fx: number,
): DailyMetric[] {
  const byDate = new Map<string, DailyMetric>();

  const blankConversions = (): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const at of enabledActionTypes) m[at] = 0;
    return m;
  };

  for (const r of rows) {
    const date = String(r.date);
    if (!date || date === "undefined") continue;

    const existing =
      byDate.get(date) ??
      ({
        date,
        spendGbp: 0,
        clicks: 0,
        leads: 0,
        schedules: 0,
        reach: 0,
        impressions: 0,
        revenueUsd: 0,
        conversions: blankConversions(),
      } satisfies DailyMetric);

    existing.spendGbp += n(r.spend);
    existing.clicks += n(r.clicks);
    // leads/schedules legacy fields retained at 0 — the new pipeline uses
    // conversions[actionType] instead.
    existing.reach += n(r.reach);
    existing.impressions += n(r.impressions);
    existing.revenueUsd += n(r.revenue) * fx; // raw revenue → USD-after-FX

    byDate.set(date, existing);
  }

  // Layer conversion counts onto whichever date buckets exist; create buckets
  // for dates that have conversions but no spend row (rare, but possible).
  for (const cr of conversionRows) {
    const date = String(cr.date);
    if (!date || date === "undefined") continue;
    const actionType = String(cr.action_type ?? "");
    if (!actionType) continue;

    let bucket = byDate.get(date);
    if (!bucket) {
      bucket = {
        date,
        spendGbp: 0,
        clicks: 0,
        leads: 0,
        schedules: 0,
        reach: 0,
        impressions: 0,
        revenueUsd: 0,
        conversions: blankConversions(),
      };
      byDate.set(date, bucket);
    }
    if (!bucket.conversions) bucket.conversions = blankConversions();
    bucket.conversions[actionType] = (bucket.conversions[actionType] ?? 0) + n(cr.count);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Collapse per-day campaign rows into one row per campaign (summing over the
// range). Status is "Active" unless every row for that campaign is paused.
function aggregateCampaigns(
  rows: Partial<CampaignMetricsDailyRow>[],
  conversionRows: Partial<ConversionMetricsCampaignDailyRow>[],
  enabledActionTypes: string[],
  fx: number,
): Campaign[] {
  type Acc = Campaign & { _anyActive: boolean };
  const byCampaign = new Map<string, Acc>();

  const blankConversions = (): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const at of enabledActionTypes) m[at] = 0;
    return m;
  };

  for (const r of rows) {
    const id = String(r.campaign_id ?? "");
    if (!id || id === "undefined") continue;

    const existing =
      byCampaign.get(id) ??
      ({
        id,
        name: r.campaign_name ?? id,
        status: "Paused",
        spendGbp: 0,
        clicks: 0,
        leads: 0,
        schedules: 0,
        reach: 0,
        impressions: 0,
        revenueUsd: 0,
        conversions: blankConversions(),
        _anyActive: false,
      } as Acc);

    existing.spendGbp += n(r.spend);
    existing.clicks += n(r.clicks);
    existing.reach += n(r.reach);
    existing.impressions += n(r.impressions);
    existing.revenueUsd += n(r.revenue) * fx;
    if ((r.status ?? "").toLowerCase() === "active") existing._anyActive = true;

    byCampaign.set(id, existing);
  }

  for (const cr of conversionRows) {
    const id = String(cr.campaign_id ?? "");
    if (!id || id === "undefined") continue;
    const actionType = String(cr.action_type ?? "");
    if (!actionType) continue;

    let bucket = byCampaign.get(id);
    if (!bucket) {
      bucket = {
        id,
        name: id,
        status: "Paused",
        spendGbp: 0,
        clicks: 0,
        leads: 0,
        schedules: 0,
        reach: 0,
        impressions: 0,
        revenueUsd: 0,
        conversions: blankConversions(),
        _anyActive: false,
      } as Acc;
      byCampaign.set(id, bucket);
    }
    if (!bucket.conversions) bucket.conversions = blankConversions();
    bucket.conversions[actionType] = (bucket.conversions[actionType] ?? 0) + n(cr.count);
  }

  return Array.from(byCampaign.values())
    .map(({ _anyActive, ...c }): Campaign => ({
      ...c,
      status: _anyActive ? "Active" : "Paused",
    }))
    .sort((a, b) => b.spendGbp - a.spendGbp);
}
