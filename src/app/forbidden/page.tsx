import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

// Shown when a signed-in user lacks the role for a staff-only page
// (requireStaff() redirects here).
export const metadata = {
  title: "No access — funnels.com Meta Ads",
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          funnels.com · Meta Ads
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Your account isn&apos;t allowed here. If you think this is a mistake,
          contact your account manager.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300"
          >
            Go home
          </Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
