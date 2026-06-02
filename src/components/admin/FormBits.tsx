"use client";

// Small shared building blocks for the admin forms: a submit button that shows
// a pending state, and a banner that shows a success/error message from a
// Server Action's ActionResult. Kept tiny and dependency-free.

import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/admin/actions";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function ResultBanner({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-sm ${
        result.ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/30 bg-red-500/10 text-red-300"
      }`}
    >
      {result.message}
    </p>
  );
}

// Shared input styling so the forms stay consistent.
export const inputClass =
  "w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-amber-400/50 focus:outline-none";
export const labelClass = "block text-sm font-medium text-neutral-300";
