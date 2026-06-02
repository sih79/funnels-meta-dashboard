import "server-only";

// Server-only data-access layer for the multi-client dashboards.
//
// Reads the CACHE (Supabase) — never the live Meta API — and aggregates rows
// into the existing DashboardData / Totals / DailyMetric / Campaign shapes the
// presentational components already expect. The sync robot (Phase 3) keeps the
// cache fresh; this layer just reads + aggregates it.
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
} from "@/lib/supabase/db.types";
import type { Campaign, DailyMetric, DashboardData, Totals } from "@/lib/types";

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

function sum<T>(arr: T[], pick: (t: T) => number): number {
  return arr.reduce((acc, t) => acc + pick(t), 0);
}

function buildTotals(daily: DailyMetric[], fx: number): Totals {
  const spendGbp = sum(daily, (d) => d.spendGbp);
  const clicks = sum(daily, (d) => d.clicks);
  const leads = sum(daily, (d) => d.leads);
  const schedules = sum(daily, (d) => d.schedules);
  const reach = sum(daily, (d) => d.reach);
  const impressions = sum(daily, (d) => d.impressions);
  const revenueUsd = sum(daily, (d) => d.revenueUsd);
  const spendUsd = spendGbp * fx;

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
  };
}

function emptyTotals(): Totals {
  return buildTotals([], FX_GBP_TO_USD);
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
    };
  }

  // Pull daily + per-campaign rows for the window across all the accounts.
  const [{ data: metricRows }, { data: campaignRows }] = await Promise.all([
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
  ]);

  const daily = aggregateDaily(
    (metricRows as Partial<MetricsDailyRow>[] | null) ?? [],
    fx,
  );
  const campaigns = aggregateCampaigns(
    (campaignRows as Partial<CampaignMetricsDailyRow>[] | null) ?? [],
    fx,
  );

  return {
    source: "live",
    fxGbpToUsd: fx,
    rangeStart: daily.length ? daily[0].date : range.since,
    rangeEnd: daily.length ? daily[daily.length - 1].date : range.until,
    daily,
    campaigns,
    totals: buildTotals(daily, fx),
  };
}

// Collapse per-account daily rows into one row per date (summing across the
// client's accounts), sorted oldest → newest like the demo data.
function aggregateDaily(rows: Partial<MetricsDailyRow>[], fx: number): DailyMetric[] {
  const byDate = new Map<string, DailyMetric>();

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
      } satisfies DailyMetric);

    existing.spendGbp += n(r.spend);
    existing.clicks += n(r.clicks);
    existing.leads += n(r.leads);
    existing.schedules += n(r.schedules);
    existing.reach += n(r.reach);
    existing.impressions += n(r.impressions);
    existing.revenueUsd += n(r.revenue) * fx; // raw revenue → USD-after-FX

    byDate.set(date, existing);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Collapse per-day campaign rows into one row per campaign (summing over the
// range). Status is "Active" unless every row for that campaign is paused.
function aggregateCampaigns(
  rows: Partial<CampaignMetricsDailyRow>[],
  fx: number,
): Campaign[] {
  type Acc = Campaign & { _anyActive: boolean };
  const byCampaign = new Map<string, Acc>();

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
        _anyActive: false,
      } as Acc);

    existing.spendGbp += n(r.spend);
    existing.clicks += n(r.clicks);
    existing.leads += n(r.leads);
    existing.schedules += n(r.schedules);
    existing.reach += n(r.reach);
    existing.impressions += n(r.impressions);
    existing.revenueUsd += n(r.revenue) * fx;
    if ((r.status ?? "").toLowerCase() === "active") existing._anyActive = true;

    byCampaign.set(id, existing);
  }

  return Array.from(byCampaign.values())
    .map(({ _anyActive, ...c }): Campaign => ({
      ...c,
      status: _anyActive ? "Active" : "Paused",
    }))
    .sort((a, b) => b.spendGbp - a.spendGbp);
}
