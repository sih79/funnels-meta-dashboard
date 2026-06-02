"use client";

// Email + password sign-in form. Uses the browser Supabase client directly so
// the session cookies are written client-side; the proxy then keeps them fresh
// on subsequent requests. On success we hard-navigate to `next` (or /) so the
// freshly-set auth cookies are picked up by the server on the next request.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only allow internal redirects to avoid open-redirect abuse.
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Map Supabase's terse messages to something friendlier.
        const msg =
          signInError.message === "Invalid login credentials"
            ? "That email and password don't match. Please try again."
            : signInError.message || "Could not sign you in. Please try again.";
        setError(msg);
        setLoading(false);
        return;
      }

      // refresh() revalidates Server Components; push() moves to the target.
      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-neutral-300"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-neutral-300"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
