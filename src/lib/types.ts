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
  conversions?: Record<string, number>; // action_type → count for this day
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
  conversions?: Record<string, number>; // action_type → count summed over the range
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
  conversionTotals: Record<string, number>; // action_type → total count
  costPerConversion: Record<string, number>; // action_type → spendGbp / count
}

export interface TrackedConversion {
  actionType: string;
  displayName: string;
  displayOrder: number;
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
  trackedConversions: TrackedConversion[];
}
