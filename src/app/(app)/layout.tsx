import Link from "next/link";
import { requireUser, getProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import SignOutButton from "@/components/SignOutButton";

// Shared chrome for the authenticated app (dashboards). Top bar with the
// funnels.com wordmark + sign-out. Requires login as defence-in-depth.
//
// When Supabase isn't configured (offline build / fresh checkout) we skip the
// auth gate so the bare chrome still renders — the pages inside handle the
// "logins aren't set up" message themselves.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Show the Admin link only to staff/admin. We fetch the profile when
  // configured (requireUser also runs as the auth gate).
  let isStaff = false;
  if (isSupabaseConfigured()) {
    await requireUser();
    const profile = await getProfile();
    isStaff =
      profile?.role === "admin" ||
      profile?.role === "staff" ||
      profile?.role === "super_admin";
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-white/10 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight text-white">
              funnels<span className="text-amber-400">.com</span>
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Meta Ads
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {isStaff && (
              <Link
                href="/admin"
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-neutral-300 transition hover:border-amber-400/40 hover:text-white"
              >
                Admin
              </Link>
            )}
            {isSupabaseConfigured() && <SignOutButton />}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
