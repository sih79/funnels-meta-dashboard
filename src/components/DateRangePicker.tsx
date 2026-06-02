"use client";

// Date-range picker for the dashboards. A row of preset buttons plus a custom
// from/to pair. Selecting anything rewrites the URL query (?range= or
// ?since=&until=) which re-renders the server component with new data.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  PRESET_OPTIONS,
  type RangePreset,
  type ResolvedRange,
} from "@/lib/dateRange";

export default function DateRangePicker({ range }: { range: ResolvedRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Build a new URL preserving any unrelated query params, then navigate.
  function push(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function selectPreset(preset: Exclude<RangePreset, "custom">) {
    // Switching to a preset clears any custom since/until.
    push({ range: preset, since: null, until: null });
  }

  function setCustom(part: "since" | "until", value: string) {
    if (!value) return;
    const since = part === "since" ? value : range.since;
    const until = part === "until" ? value : range.until;
    push({ range: "custom", since, until });
  }

  const baseBtn =
    "rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-60";
  const activeBtn = "bg-amber-400 text-neutral-950";
  const idleBtn =
    "border border-white/10 bg-neutral-900 text-neutral-300 hover:border-amber-400/40 hover:text-white";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${isPending ? "opacity-70" : ""}`}
      aria-busy={isPending}
    >
      {PRESET_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => selectPreset(opt.value)}
          disabled={isPending}
          className={`${baseBtn} ${range.preset === opt.value ? activeBtn : idleBtn}`}
        >
          {opt.label}
        </button>
      ))}

      <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden />

      <div
        className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${
          range.preset === "custom"
            ? "border-amber-400/40 bg-amber-400/5"
            : "border-white/10 bg-neutral-900"
        }`}
      >
        <label className="sr-only" htmlFor="range-since">
          From
        </label>
        <input
          id="range-since"
          type="date"
          value={range.since}
          max={range.until}
          onChange={(e) => setCustom("since", e.target.value)}
          disabled={isPending}
          className="bg-transparent text-xs text-neutral-200 outline-none [color-scheme:dark]"
        />
        <span className="text-xs text-neutral-500">→</span>
        <label className="sr-only" htmlFor="range-until">
          To
        </label>
        <input
          id="range-until"
          type="date"
          value={range.until}
          min={range.since}
          onChange={(e) => setCustom("until", e.target.value)}
          disabled={isPending}
          className="bg-transparent text-xs text-neutral-200 outline-none [color-scheme:dark]"
        />
      </div>
    </div>
  );
}
