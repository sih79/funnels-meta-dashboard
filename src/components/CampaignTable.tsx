"use client";

import { useMemo, useState } from "react";
import type { Campaign } from "@/lib/types";
import { gbp, num, pct, roasX } from "@/lib/format";

type Row = Campaign & {
  cpc: number;
  cpl: number;
  ctr: number;
  convRate: number;
  costPerSchedule: number;
  roas: number;
};

type SortKey = keyof Row;

const COLS: { key: SortKey; label: string; render: (r: Row) => string; num: boolean }[] = [
  { key: "name", label: "Campaign", render: (r) => r.name, num: false },
  { key: "spendGbp", label: "Spend", render: (r) => gbp(r.spendGbp), num: true },
  { key: "clicks", label: "Clicks", render: (r) => num(r.clicks), num: true },
  { key: "ctr", label: "CTR", render: (r) => pct(r.ctr, 2), num: true },
  { key: "cpc", label: "CPC", render: (r) => gbp(r.cpc), num: true },
  { key: "leads", label: "Leads", render: (r) => num(r.leads), num: true },
  { key: "cpl", label: "CPL", render: (r) => gbp(r.cpl), num: true },
  { key: "convRate", label: "Conv %", render: (r) => pct(r.convRate), num: true },
  { key: "schedules", label: "Schedules", render: (r) => num(r.schedules), num: true },
  { key: "costPerSchedule", label: "Cost/Sched", render: (r) => gbp(r.costPerSchedule), num: true },
  { key: "reach", label: "Reach", render: (r) => num(r.reach), num: true },
  { key: "roas", label: "ROAS", render: (r) => roasX(r.roas), num: true },
];

export default function CampaignTable({
  campaigns,
  fx,
}: {
  campaigns: Campaign[];
  fx: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("spendGbp");
  const [asc, setAsc] = useState(false);

  const rows: Row[] = useMemo(
    () =>
      campaigns.map((c) => ({
        ...c,
        cpc: c.clicks ? c.spendGbp / c.clicks : 0,
        cpl: c.leads ? c.spendGbp / c.leads : 0,
        ctr: c.impressions ? c.clicks / c.impressions : 0,
        convRate: c.clicks ? c.leads / c.clicks : 0,
        costPerSchedule: c.schedules ? c.spendGbp / c.schedules : 0,
        roas: c.spendGbp ? c.revenueUsd / (c.spendGbp * fx) : 0,
      })),
    [campaigns, fx]
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
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
            {COLS.map((col) => (
              <th
                key={col.key}
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
              {COLS.map((col) => (
                <td
                  key={col.key}
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
