// Date-range resolution for the dashboards.
//
// Shared by the server (to resolve searchParams into a {since, until} window
// for DB queries) and the client DateRangePicker (which only needs the preset
// list + labels). Everything is plain data + pure functions so it can be
// imported from both server and client components.

export type RangePreset =
  | "today"
  | "last7"
  | "last14"
  | "last30"
  | "this_month"
  | "last_month"
  | "custom";

export const DEFAULT_PRESET: Exclude<RangePreset, "custom"> = "last30";

// Ordered list used to render the preset buttons (custom is handled by the
// from/to inputs, so it's intentionally excluded from this list).
export const PRESET_OPTIONS: { value: Exclude<RangePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7d" },
  { value: "last14", label: "Last 14d" },
  { value: "last30", label: "Last 30d" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

export interface ResolvedRange {
  preset: RangePreset;
  since: string; // ISO yyyy-mm-dd (inclusive)
  until: string; // ISO yyyy-mm-dd (inclusive)
}

// --- date helpers (all UTC, to match the rest of the app's yyyy-mm-dd usage) ---

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(d: Date, delta: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + delta);
  return copy;
}

// Returns true for a well-formed yyyy-mm-dd that's also a real calendar date.
function isValidIsoDate(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && iso(d) === value;
}

function isPreset(value: string | undefined | null): value is RangePreset {
  return (
    value === "today" ||
    value === "last7" ||
    value === "last14" ||
    value === "last30" ||
    value === "this_month" ||
    value === "last_month" ||
    value === "custom"
  );
}

/**
 * Resolve a preset name into an inclusive {since, until} window (UTC).
 * "today" is a single-day window; the lastN presets include today.
 */
export function resolvePreset(preset: Exclude<RangePreset, "custom">): { since: string; until: string } {
  const today = todayUtc();

  switch (preset) {
    case "today":
      return { since: iso(today), until: iso(today) };
    case "last7":
      return { since: iso(addDays(today, -6)), until: iso(today) };
    case "last14":
      return { since: iso(addDays(today, -13)), until: iso(today) };
    case "last30":
      return { since: iso(addDays(today, -29)), until: iso(today) };
    case "this_month": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { since: iso(start), until: iso(today) };
    }
    case "last_month": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)); // day 0 = last day of prev month
      return { since: iso(start), until: iso(end) };
    }
  }
}

// searchParams values can be string | string[] | undefined in Next 16.
type ParamValue = string | string[] | undefined;
function one(value: ParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve the date range from a page's (already-awaited) searchParams.
 *
 * - `?range=<preset>` selects a preset.
 * - `?since=YYYY-MM-DD&until=YYYY-MM-DD` selects an explicit custom range
 *   (and is also used when `range=custom`). Invalid/partial custom values fall
 *   back to the default preset.
 * - Nothing → DEFAULT_PRESET (last 30 days).
 */
export function resolveRange(searchParams: Record<string, ParamValue>): ResolvedRange {
  const rangeParam = one(searchParams.range);
  const sinceParam = one(searchParams.since);
  const untilParam = one(searchParams.until);

  // Explicit custom window (with or without range=custom).
  if (rangeParam === "custom" || (sinceParam && untilParam)) {
    if (isValidIsoDate(sinceParam) && isValidIsoDate(untilParam)) {
      // Normalise so since <= until.
      const since = sinceParam <= untilParam ? sinceParam : untilParam;
      const until = sinceParam <= untilParam ? untilParam : sinceParam;
      return { preset: "custom", since, until };
    }
    // Malformed custom range → fall through to default.
  }

  if (isPreset(rangeParam) && rangeParam !== "custom") {
    return { preset: rangeParam, ...resolvePreset(rangeParam) };
  }

  return { preset: DEFAULT_PRESET, ...resolvePreset(DEFAULT_PRESET) };
}
