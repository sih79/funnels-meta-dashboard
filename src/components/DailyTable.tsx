import type { DailyMetric, TrackedConversion } from "@/lib/types";
import { gbp, num, pct, shortDate, usd } from "@/lib/format";

// Mirrors the "Ads Tracking Sheet" rows, one day per row (newest first).
// Renders one column per admin-enabled tracked conversion (no fixed
// leads/schedules columns any more — those are now arbitrary picks).
export default function DailyTable({
  daily,
  fx,
  trackedConversions,
}: {
  daily: DailyMetric[];
  fx: number;
  trackedConversions: TrackedConversion[];
}) {
  const rows = [...daily].reverse();

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-neutral-400">
            <th className="px-4 py-3 text-left font-medium">Date</th>
            <th className="px-4 py-3 text-right font-medium">Total Spent</th>
            <th className="px-4 py-3 text-right font-medium">Clicks</th>
            <th className="px-4 py-3 text-right font-medium">CPC</th>
            <th className="px-4 py-3 text-right font-medium">CTR</th>
            {trackedConversions.map((tc) => (
              <th
                key={tc.actionType}
                className="bg-amber-400/10 px-4 py-3 text-right font-medium text-amber-300"
              >
                {tc.displayName}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium">Spent (USD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.date}
              className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
            >
              <td className="whitespace-nowrap px-4 py-2.5 text-left font-medium text-white">
                {shortDate(d.date)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">
                {gbp(d.spendGbp)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">
                {num(d.clicks)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">
                {d.clicks ? gbp(d.spendGbp / d.clicks) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">
                {d.impressions ? pct(d.clicks / d.impressions, 2) : "—"}
              </td>
              {trackedConversions.map((tc) => {
                const c = d.conversions?.[tc.actionType] ?? 0;
                return (
                  <td
                    key={tc.actionType}
                    className="bg-amber-400/[0.06] px-4 py-2.5 text-right tabular-nums font-medium text-amber-300"
                  >
                    {num(c)}
                  </td>
                );
              })}
              <td className="px-4 py-2.5 text-right tabular-nums text-neutral-400">
                {usd(d.spendGbp * fx)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
