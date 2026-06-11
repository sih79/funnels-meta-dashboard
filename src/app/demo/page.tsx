import KpiCard from "@/components/KpiCard";
import CampaignTable from "@/components/CampaignTable";
import DailyTable from "@/components/DailyTable";
import { LeadsCplChart, SpendRoasChart } from "@/components/Charts";
import { getDashboardData } from "@/lib/data";
import { gbp, num, pct, roasX, shortDate, usd } from "@/lib/format";

export default async function Home() {
  const data = await getDashboardData();
  const t = data.totals;
  const isLive = data.source === "live";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            funnels.com · Meta Ads
          </p>
          <h1 className="mt-1 text-3xl font-bold text-white">Ads Tracking Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Shaqir Hussyin — Class, Audit, Agency &amp; CBT campaigns
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-neutral-300">
            {shortDate(data.rangeStart)} – {shortDate(data.rangeEnd)}
          </p>
          <p className="text-xs text-neutral-500">
            Last 30 days · FX £1 = ${data.fxGbpToUsd.toFixed(2)}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${
              isLive
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-amber-400/10 text-amber-300"
            }`}
          >
            {isLive ? "● Live Meta data" : "Demo data"}
          </span>
        </div>
      </header>

      {data.warning && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {data.warning} — showing demo data instead.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Spent" value={gbp(t.spendGbp)} sub={`${usd(t.spendUsd)} USD`} />
        <KpiCard label="ROAS" value={roasX(t.roas)} sub={`${usd(t.revenueUsd)} revenue`} accent />
        <KpiCard label="Total Leads" value={num(t.leads)} sub={`${num(t.schedules)} schedules`} />
        <KpiCard label="Cost / Lead" value={gbp(t.cpl)} sub={`CPC ${gbp(t.cpc)}`} />
        <KpiCard label="Reach" value={num(t.reach)} sub={`${num(t.impressions)} impressions`} />
        <KpiCard label="CTR" value={pct(t.ctr, 2)} sub={`Conv ${pct(t.convRate)}`} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <SpendRoasChart daily={data.daily} fx={data.fxGbpToUsd} />
        <LeadsCplChart daily={data.daily} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Campaign breakdown</h2>
        <CampaignTable
          campaigns={data.campaigns}
          fx={data.fxGbpToUsd}
          trackedConversions={data.trackedConversions}
        />
      </section>

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

      <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-neutral-600">
        {isLive
          ? "Live data from the Meta Marketing API."
          : "Demo data · add META_ACCESS_TOKEN + META_AD_ACCOUNT_ID to .env.local to go live (see .env.local.example)."}
      </footer>
    </main>
  );
}
