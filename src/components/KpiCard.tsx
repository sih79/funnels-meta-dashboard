interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

export default function KpiCard({ label, value, sub, accent }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent
          ? "border-amber-400/40 bg-amber-400/5"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
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
