interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

// Visual style: layered glass card with a gradient surface, an inner ring
// (top edge highlight), and a soft drop shadow. Subtle lift on hover. Accent
// variant uses an amber-tinted gradient for the headline tile (ROAS).
export default function KpiCard({ label, value, sub, accent }: KpiCardProps) {
  const base = accent
    ? "border-amber-400/30 bg-gradient-to-b from-amber-400/[0.12] via-amber-400/[0.06] to-amber-400/[0.02] shadow-[0_8px_24px_-12px_rgba(251,191,36,0.45),0_2px_6px_-2px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-amber-200/10"
    : "border-white/[0.08] bg-gradient-to-b from-white/[0.07] via-white/[0.035] to-white/[0.015] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55),0_2px_6px_-2px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/[0.06]";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.6),0_4px_10px_-4px_rgba(0,0,0,0.5)] ${base}`}
    >
      {/* Top highlight stripe: thin specular edge along the top */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          accent ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
