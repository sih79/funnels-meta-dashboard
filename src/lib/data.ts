import "server-only";
import type { DashboardData } from "./types";
import { getMockDashboard } from "./mockData";
import { fetchMetaDashboard, readMetaConfigFromEnv } from "./meta";

// Single entry point for the dashboard. Uses live Meta data when
// META_ACCESS_TOKEN + META_AD_ACCOUNT_ID are set; otherwise serves demo
// data. If a live fetch fails, it falls back to demo data with a warning
// so the page still renders.
export async function getDashboardData(): Promise<DashboardData> {
  const cfg = readMetaConfigFromEnv();
  if (!cfg) return getMockDashboard();

  try {
    return await fetchMetaDashboard(cfg);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[meta] live fetch failed, falling back to demo data:", message);
    return { ...getMockDashboard(), warning: `Live Meta fetch failed: ${message}` };
  }
}
