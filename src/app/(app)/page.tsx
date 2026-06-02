import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAccessibleClients } from "@/lib/dashboard";

// App entry point.
// - Supabase unconfigured → keep the existing "logins aren't set up" message.
// - Single accessible client (typical for a client user, or staff with one
//   client) → go straight to that client's dashboard.
// - Multiple clients (staff/admin) → redirect to the first client; the client
//   tabs live in the per-client layout so the user can switch.
// - Zero clients → friendly "no clients yet" landing.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="flex flex-1 items-center justify-center bg-neutral-950 px-4 py-12">
        <div className="w-full max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            funnels.com · Meta Ads
          </p>
          <h1 className="mt-3 text-2xl font-bold text-white">
            Logins aren&apos;t set up yet
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Add your Supabase keys to <code>.env.local</code> (see{" "}
            <code>SETUP.md</code>) to enable sign-in. In the meantime, the demo
            dashboard works without any setup.
          </p>
          <Link
            href="/demo"
            className="mt-6 inline-block rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300"
          >
            View demo dashboard
          </Link>
        </div>
      </main>
    );
  }

  await requireUser();
  const clients = await getAccessibleClients();

  if (clients.length === 0) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            funnels.com · Meta Ads
          </p>
          <h1 className="mt-3 text-2xl font-bold text-white">No clients yet</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Once a client and ad account are connected, their dashboard will show
            up here. In the meantime, preview the{" "}
            <Link href="/demo" className="text-amber-400 hover:text-amber-300">
              demo dashboard
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  // Land on the first accessible client. For a single-client user this is just
  // "their" dashboard; for staff it's the first tab (they can switch tabs).
  redirect(`/clients/${clients[0].slug}`);
}
