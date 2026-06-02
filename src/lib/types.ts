// Domain types for the funnels.com / Shaqir Hussyin Meta Ads tracker.
// Mirrors the "Ads Tracking Sheet" rows, plus ROAS / reach / CTR.

export interface DailyMetric {
  date: string; // ISO yyyy-mm-dd
  spendGbp: number; // Total Spent - Class, Audit, Agency & CBT
  clicks: number; // Total Clicks
  leads: number; // Total Leads
  schedules: number; // Website Schedule (calls booked)
  reach: number;
  impressions: number;
  revenueUsd: number; // attributed revenue, used for ROAS
}

export interface Campaign {
  id: string;
  name: string;
  status: "Active" | "Paused";
  spendGbp: number;
  clicks: number;
  leads: number;
  schedules: number;
  reach: number;
  impressions: number;
  revenueUsd: number;
}

export interface Totals {
  spendGbp: number;
  spendUsd: number;
  clicks: number;
  leads: number;
  schedules: number;
  reach: number;
  impressions: number;
  revenueUsd: number;
  cpc: number; // Cost Per Click
  cpl: number; // Cost Per Lead
  costPerSchedule: number;
  convRate: number; // leads / clicks
  ctr: number; // clicks / impressions
  roas: number; // revenueUsd / spendUsd
}

export interface DashboardData {
  source: "live" | "mock";
  warning?: string; // set when a live fetch was attempted but failed and we fell back to mock
  fxGbpToUsd: number;
  rangeStart: string;
  rangeEnd: string;
  daily: DailyMetric[];
  campaigns: Campaign[];
  totals: Totals;
}
