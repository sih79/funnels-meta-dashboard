import type { Campaign, DailyMetric, DashboardData, Totals } from "./types";

// Deterministic PRNG so server and client render identical numbers (no hydration mismatch).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FX_GBP_TO_USD = 1.27;
const DAYS = 30;
const END_DATE = "2026-05-30";

const CAMPAIGN_DEFS: { id: string; name: string; status: Campaign["status"] }[] = [
  { id: "class", name: "Class Registration", status: "Active" },
  { id: "audit", name: "Free Funnel Audit", status: "Active" },
  { id: "agency", name: "Agency Retainer", status: "Active" },
  { id: "cbt", name: "CBT Webinar", status: "Active" },
  { id: "retarget", name: "Retargeting — Warm", status: "Active" },
  { id: "lookalike", name: "Lookalike — Cold", status: "Paused" },
];

// Normalized weights (each column sums to 1) so campaign totals add up to the period total
// while keeping CPL / ROAS varied across campaigns.
const W = {
  spend: [0.28, 0.22, 0.18, 0.14, 0.1, 0.08],
  clicks: [0.3, 0.2, 0.15, 0.15, 0.12, 0.08],
  leads: [0.32, 0.24, 0.14, 0.12, 0.1, 0.08],
  schedules: [0.34, 0.22, 0.16, 0.12, 0.09, 0.07],
  reach: [0.26, 0.2, 0.18, 0.16, 0.12, 0.08],
  impressions: [0.27, 0.21, 0.17, 0.15, 0.12, 0.08],
  revenue: [0.3, 0.25, 0.15, 0.13, 0.1, 0.07],
};

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function generateDaily(): DailyMetric[] {
  const rand = mulberry32(20260530);
  const days: DailyMetric[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(END_DATE, -i);
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    const weekendDip = dow === 0 || dow === 6 ? 0.72 : 1; // softer spend on weekends
    const ramp = 0.8 + (DAYS - 1 - i) / (DAYS - 1) * 0.5; // gentle upward trend over time

    const spendGbp = Math.round((180 + rand() * 140) * weekendDip * ramp);
    const cpc = 0.55 + rand() * 0.35; // £0.55–0.90
    const clicks = Math.round(spendGbp / cpc);
    const convRate = 0.07 + rand() * 0.05; // 7%–12% leads/clicks
    const leads = Math.max(1, Math.round(clicks * convRate));
    const schedules = Math.max(0, Math.round(leads * (0.22 + rand() * 0.12)));
    const impressions = Math.round(clicks * (45 + rand() * 35)); // CTR ~1.5%–2.5%
    const reach = Math.round(impressions * (0.6 + rand() * 0.2));
    const revPerLeadUsd = 38 + rand() * 30;
    const revenueUsd = Math.round(leads * revPerLeadUsd);

    days.push({ date, spendGbp, clicks, leads, schedules, reach, impressions, revenueUsd });
  }
  return days;
}

function sum<T>(arr: T[], pick: (t: T) => number): number {
  return arr.reduce((acc, t) => acc + pick(t), 0);
}

function buildCampaigns(daily: DailyMetric[]): Campaign[] {
  const tSpend = sum(daily, (d) => d.spendGbp);
  const tClicks = sum(daily, (d) => d.clicks);
  const tLeads = sum(daily, (d) => d.leads);
  const tSched = sum(daily, (d) => d.schedules);
  const tReach = sum(daily, (d) => d.reach);
  const tImpr = sum(daily, (d) => d.impressions);
  const tRev = sum(daily, (d) => d.revenueUsd);

  return CAMPAIGN_DEFS.map((c, i) => ({
    ...c,
    spendGbp: Math.round(tSpend * W.spend[i]),
    clicks: Math.round(tClicks * W.clicks[i]),
    leads: Math.round(tLeads * W.leads[i]),
    schedules: Math.round(tSched * W.schedules[i]),
    reach: Math.round(tReach * W.reach[i]),
    impressions: Math.round(tImpr * W.impressions[i]),
    revenueUsd: Math.round(tRev * W.revenue[i]),
  }));
}

function buildTotals(daily: DailyMetric[]): Totals {
  const spendGbp = sum(daily, (d) => d.spendGbp);
  const clicks = sum(daily, (d) => d.clicks);
  const leads = sum(daily, (d) => d.leads);
  const schedules = sum(daily, (d) => d.schedules);
  const reach = sum(daily, (d) => d.reach);
  const impressions = sum(daily, (d) => d.impressions);
  const revenueUsd = sum(daily, (d) => d.revenueUsd);
  const spendUsd = spendGbp * FX_GBP_TO_USD;

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

// Deterministic demo data. Used when Meta credentials are not configured,
// or as a fallback if a live fetch fails. See getDashboardData() in ./data.ts.
export function getMockDashboard(): DashboardData {
  const daily = generateDaily();
  return {
    source: "mock",
    fxGbpToUsd: FX_GBP_TO_USD,
    rangeStart: daily[0].date,
    rangeEnd: daily[daily.length - 1].date,
    daily,
    campaigns: buildCampaigns(daily),
    totals: buildTotals(daily),
  };
}
