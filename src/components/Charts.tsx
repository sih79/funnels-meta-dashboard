"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyMetric } from "@/lib/types";
import { gbp, roasX, shortDate } from "@/lib/format";

const GOLD = "#fbbf24";
const GREEN = "#34d399";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "#737373";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] via-white/[0.03] to-white/[0.015] p-5 shadow-[0_10px_28px_-14px_rgba(0,0,0,0.6),0_2px_6px_-2px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-sm">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <h3 className="mb-4 text-sm font-medium text-neutral-300">{title}</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#0a0a0a",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  fontSize: 12,
} as const;

export function SpendRoasChart({
  daily,
  fx,
}: {
  daily: DailyMetric[];
  fx: number;
}) {
  const data = daily.map((d) => ({
    date: shortDate(d.date),
    spend: d.spendGbp,
    roas: +(d.revenueUsd / (d.spendGbp * fx)).toFixed(2),
  }));

  return (
    <ChartCard title="Spend (£) & ROAS over time">
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" stroke={AXIS} tick={{ fontSize: 11 }} interval={4} />
        <YAxis yAxisId="l" stroke={AXIS} tick={{ fontSize: 11 }} />
        <YAxis
          yAxisId="r"
          orientation="right"
          stroke={AXIS}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${v}×`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) =>
            name === "Spend" ? gbp(Number(value)) : roasX(Number(value))
          }
        />
        <Bar yAxisId="l" dataKey="spend" name="Spend" fill={GOLD} radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="r"
          type="monotone"
          dataKey="roas"
          name="ROAS"
          stroke={GREEN}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartCard>
  );
}

export function LeadsCplChart({
  daily,
  actionType,
  displayName,
}: {
  daily: DailyMetric[];
  actionType?: string | null;
  displayName?: string;
}) {
  // Use the first enabled tracked conversion when provided; otherwise fall
  // back to the legacy `leads` field on DailyMetric so a not-yet-configured
  // account still gets a chart.
  const label = displayName ?? "Leads";
  const data = daily.map((d) => {
    const count = actionType
      ? d.conversions?.[actionType] ?? 0
      : d.leads;
    return {
      date: shortDate(d.date),
      leads: count,
      cpl: count ? +(d.spendGbp / count).toFixed(2) : 0,
    };
  });

  return (
    <ChartCard title={`${label} & Cost per ${label} over time`}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" stroke={AXIS} tick={{ fontSize: 11 }} interval={4} />
        <YAxis yAxisId="l" stroke={AXIS} tick={{ fontSize: 11 }} />
        <YAxis
          yAxisId="r"
          orientation="right"
          stroke={AXIS}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `£${v}`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) =>
            name === "Cost" ? gbp(Number(value)) : String(value)
          }
        />
        <Bar yAxisId="l" dataKey="leads" name={label} fill={GREEN} radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="r"
          type="monotone"
          dataKey="cpl"
          name="Cost"
          stroke={GOLD}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartCard>
  );
}
