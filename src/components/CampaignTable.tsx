"use client";

import { useMemo, useState } from "react";
import type { Campaign, TrackedConversion } from "@/lib/types";
import { gbp, num, pct, roasX } from "@/lib/format";

type Row = Campaign & {
  cpc: number;
  ctr: number;
  roas: number;
  // conversion counts flattened into `conv:<actionType>` keys so the sort
  // function can address them with a string key like the other columns.
  [convKey: `conv:${string}`]: number;
};

type SortKey = keyof Row | string;

interface Col {
  key: SortKey;
  label: string;
  render: (r: Row) => string;
  num: boolean;
}

const BASE_COLS: Col[] = [
  { key: "name", label: "Campaign", render: (r) => r.name, num: false },
  { key: "spendGbp", label: "Spend", render: (r) => gbp(r.spendGbp), num: true },
  { key: "clicks", label: "Clicks", render: (r) => num(r.clicks), num: true },
  { key: "ctr", label: "CTR", render: (r) => pct(r.ctr, 2), num: true },
  { key: "cpc", label: "CPC", render: (r) => gbp(r.cpc), num: true },
  { key: "reach", label: "Reach", render: (r) => num(r.reach), num: true },
  { key: "roas", label: "ROAS", render: (r) => roasX(r.roas), num: true },
];

export default function CampaignTable({
  campaigns,
  fx,
  trackedConversions,
}: {
  campaigns: Campaign[];
  fx: number;
  trackedConversions: TrackedConversion[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("spendGbp");
  const [asc, setAsc] = useState(false);

  const cols: Col[] = useMemo(() => {
    const out: Col[] = [...BASE_COLS];
    for (const tc of trackedConversions) {
      const convKey = `conv:${tc.actionType}` as SortKey;
      out.push({
        key: convKey,
        label: tc.displayName,
        render: (r) => num((r as unknown as Record<string, number>)[convKey] ?? 0),
        num: true,
      });
    }
    return out;
  }, [trackedConversions]);

  const rows: Row[] = useMemo(
    () =>
      campaigns.map((c) => {
        const base: Row = {
          ...c,
          cpc: c.clicks ? c.spendGbp / c.clicks : 0,
          ctr: c.impressions ? c.clicks / c.impressions : 0,
          roas: c.spendGbp ? c.revenueUsd / (c.spendGbp * fx) : 0,
        };
        for (const tc of trackedConversions) {
          (base as unknown as Record<string, number>)[`conv:${tc.actionType}`] =
            c.conversions?.[tc.actionType] ?? 0;
        }
        return base;
      }),
    [campaigns, fx, trackedConversions],
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey as string];
      const bv = (b as unknown as Record<string, unknown>)[sortKey as string];
      if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
      return asc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-neutral-400">
            {cols.map((col) => (
              <th
                key={String(col.key)}
                onClick={() => toggleSort(col.key)}
                className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 font-medium hover:text-amber-300 ${
                  col.num ? "text-right" : "text-left"
                }`}
              >
                {col.label}
                {sortKey === col.key && <span className="ml-1">{asc ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
              {cols.map((col) => (
                <td
                  key={String(col.key)}
                  className={`whitespace-nowrap px-4 py-3 tabular-nums ${
                    col.num ? "text-right text-neutral-200" : "text-left"
                  }`}
                >
                  {col.key === "name" ? (
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          r.status === "Active" ? "bg-emerald-400" : "bg-neutral-500"
                        }`}
                      />
                      <span className="font-medium text-white">{r.name}</span>
                    </span>
                  ) : (
                    col.render(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
