// Reusable dashboard view. Takes already-loaded DashboardData + the client name
// + the resolved range and renders the full dashboard (header, KPIs, charts,
// campaign table, daily table). This is the refactored, data-as-props version
// of what /demo renders, so all clients share one layout.
//
// KPIs are dynamic per ad account: Spend / ROAS / CTR / CPC are fixed, then
// ONE tile per admin-enabled tracked conversion (showing total count + cost
// per conversion). If no conversions are enabled, fall back to the legacy
// Reach + CTR pair so the dashboard stays balanced.

import KpiCard from "@/components/KpiCard";
import CampaignTable from "@/components/CampaignTable";
import DailyTable from "@/components/DailyTable";
import { LeadsCplChart, SpendRoasChart } from "@/components/Charts";
import DateRangePicker from "@/components/DateRangePicker";
import { gbp, num, pct, roasX, shortDate, usd } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import type { ResolvedRange } from "@/lib/dateRange";

// Cap the number of conversion KPIs we render up front so the grid stays sane.
const MAX_CONVERSION_KPIS = 6;

export default function ClientDashboard({
  data,
  clientName,
  range,
}: {
  data: DashboardData;
  clientName: string;
  range: ResolvedRange;
}) {
  const t = data.totals;
  const isLive = data.source === "live";
  const hasData = data.daily.length > 0;
  const tracked = data.trackedConversions.slice(0, MAX_CONVERSION_KPIS);
  const firstTrackedActionType = tracked[0]?.actionType ?? null;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            funnels.com · Meta Ads
          </p>
          <h1 className="mt-1 text-3xl font-bold text-white">{clientName}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {shortDate(data.rangeStart)} – {shortDate(data.rangeEnd)} · FX £1 = $
            {data.fxGbpToUsd.toFixed(2)}
          </p>
        </div>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
            isLive
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-amber-400/10 text-amber-300"
          }`}
        >
          {isLive ? "● Live Meta data" : "Demo data"}
        </span>
      </header>

      <div className="mb-8">
        <DateRangePicker range={range} />
      </div>

      {data.warning && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {data.warning}
        </div>
      )}

      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Total Spent" value={gbp(t.spendGbp)} sub={`${usd(t.spendUsd)} USD`} />
            <KpiCard
              label="ROAS"
              value={roasX(t.roas)}
              sub={`${usd(t.revenueUsd)} revenue`}
              accent
            />
            <KpiCard label="CTR" value={pct(t.ctr, 2)} sub={`${num(t.clicks)} clicks`} />
            <KpiCard label="CPC" value={gbp(t.cpc)} sub={`${num(t.impressions)} impressions`} />
            {tracked.length === 0 ? (
              <>
                <KpiCard
                  label="Reach"
                  value={num(t.reach)}
                  sub="No conversions enabled"
                />
                <KpiCard
                  label="Conversions"
                  value="—"
                  sub="Enable in admin → conversions"
                />
              </>
            ) : (
              tracked.map((tc) => {
                const count = t.conversionTotals[tc.actionType] ?? 0;
                const cost = t.costPerConversion[tc.actionType] ?? 0;
                return (
                  <KpiCard
                    key={tc.actionType}
                    label={tc.displayName}
                    value={num(count)}
                    sub={`cost ${count ? gbp(cost) : "—"}`}
                  />
                );
              })
            )}
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <SpendRoasChart daily={data.daily} fx={data.fxGbpToUsd} />
            <LeadsCplChart
              daily={data.daily}
              actionType={firstTrackedActionType}
              displayName={tracked[0]?.displayName ?? "Leads"}
            />
          </section>

          {data.campaigns.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-white">Campaign breakdown</h2>
              <CampaignTable
                campaigns={data.campaigns}
                fx={data.fxGbpToUsd}
                trackedConversions={data.trackedConversions}
              />
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-white">Daily tracking</h2>
            <p className="mb-3 text-sm text-neutral-500">
              Mirrors the Ads Tracking Sheet, one day per row (newest first).
            </p>
            <DailyTable
              daily={data.daily}
              fx={data.fxGbpToUsd}
              trackedConversions={data.trackedConversions}
            />
          </section>
        </>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center">
      <p className="text-3xl">No data</p>
      <h2 className="mt-3 text-lg font-semibold text-white">No data yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
        The sync robot will fill this in on its next run, or an admin can trigger
        a refresh. Try widening the date range too — there may be data outside the
        current window.
      </p>
    </div>
  );
}
