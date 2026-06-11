"use client";

import { useEffect, useState } from "react";
import { gbp, num } from "@/lib/format";
import type { TrackedConversion } from "@/lib/types";

// "Cost per selected conversion" KPI tile with a dropdown. Lets the viewer
// spotlight whichever conversion's cost-per-result matters most right now.
// Defaults to the first enabled tracked conversion. The choice is persisted
// to localStorage (per client slug) so it survives reloads.
//
// Renders nothing when no conversions are enabled — the regular KPI grid
// already shows a placeholder in that case.
export default function CostPerResultCard({
  trackedConversions,
  conversionTotals,
  costPerConversion,
  storageKey,
}: {
  trackedConversions: TrackedConversion[];
  conversionTotals: Record<string, number>;
  costPerConversion: Record<string, number>;
  storageKey: string;
}) {
  const [selected, setSelected] = useState<string>(
    trackedConversions[0]?.actionType ?? "",
  );

  // Hydrate the saved choice on mount (if it still exists in the tracked list).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && trackedConversions.some((tc) => tc.actionType === saved)) {
        setSelected(saved);
      }
    } catch {
      // localStorage may throw in private browsing — fail silent.
    }
  }, [storageKey, trackedConversions]);

  function onChange(next: string) {
    setSelected(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* ignore */
    }
  }

  if (trackedConversions.length === 0) return null;

  const count = conversionTotals[selected] ?? 0;
  const cost = costPerConversion[selected] ?? 0;
  const tc = trackedConversions.find((t) => t.actionType === selected);
  const label = tc?.displayName ?? "Conversion";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-amber-400/30 bg-gradient-to-b from-amber-400/[0.14] via-amber-400/[0.07] to-amber-400/[0.02] p-5 shadow-[0_8px_24px_-12px_rgba(251,191,36,0.45),0_2px_6px_-2px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-amber-200/10 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(251,191,36,0.55),0_4px_10px_-4px_rgba(0,0,0,0.5)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/40 to-transparent" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
          Cost per result
        </p>
        <select
          value={selected}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 focus:border-amber-400 focus:outline-none"
          aria-label="Pick conversion"
        >
          {trackedConversions.map((tc) => (
            <option key={tc.actionType} value={tc.actionType}>
              {tc.displayName}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-300">
        {count ? gbp(cost) : "—"}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {label} · {num(count)} result{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}
