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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
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

export function LeadsCplChart({ daily }: { daily: DailyMetric[] }) {
  const data = daily.map((d) => ({
    date: shortDate(d.date),
    leads: d.leads,
    cpl: +(d.spendGbp / d.leads).toFixed(2),
  }));

  return (
    <ChartCard title="Leads & Cost per Lead over time">
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
            name === "Leads" ? String(value) : gbp(Number(value))
          }
        />
        <Bar yAxisId="l" dataKey="leads" name="Leads" fill={GREEN} radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="r"
          type="monotone"
          dataKey="cpl"
          name="CPL"
          stroke={GOLD}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartCard>
  );
}
