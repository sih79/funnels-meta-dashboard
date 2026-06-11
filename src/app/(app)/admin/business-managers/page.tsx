import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff, isSuperAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getBusinessManagersWithTokenStatus } from "@/lib/admin/data";
import AddBusinessManagerForm from "@/components/admin/AddBusinessManagerForm";
import BusinessManagerCard from "@/components/admin/BusinessManagerCard";

// Super-admin-only page to manage business managers and their per-BM Meta
// access tokens. The page redirects non-super-admins to /forbidden; each
// server action ALSO checks isSuperAdmin (defence-in-depth, since Server
// Actions are reachable by direct POST).
export const dynamic = "force-dynamic";

export default async function BusinessManagersPage() {
  if (!isSupabaseConfigured()) {
    return <NotConfigured />;
  }
  const profile = await requireStaff();
  if (!isSuperAdmin(profile)) redirect("/forbidden");

  const bms = await getBusinessManagersWithTokenStatus();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          Admin · Super admin
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">Business Managers</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Manage business managers and their Meta access tokens. The sync robot
          uses the per-BM token when one is set, falling back to{" "}
          <code className="text-neutral-300">META_ACCESS_TOKEN</code> otherwise.
        </p>
        <div className="mt-3">
          <Link
            href="/admin"
            className="text-sm text-amber-400/80 transition hover:text-amber-300"
          >
            &larr; Back to admin
          </Link>
        </div>
      </header>

      <section className="mb-8 rounded-xl border border-white/10 bg-neutral-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Add a business manager
        </h2>
        <AddBusinessManagerForm />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">
          Existing business managers
        </h2>
        {bms.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-neutral-900/50 p-6 text-sm text-neutral-400">
            No business managers yet. Add your first one using the form above.
          </div>
        ) : (
          bms.map((bm) => (
            <BusinessManagerCard
              key={bm.id}
              id={bm.id}
              name={bm.name}
              slug={bm.slug}
              hasMetaToken={bm.hasMetaToken}
              metaTokenUpdatedAt={bm.metaTokenUpdatedAt}
            />
          ))
        )}
      </section>
    </main>
  );
}

function NotConfigured() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
        Admin
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">
        Set up Supabase first
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        The admin tools need a database connection. Add your Supabase keys to{" "}
        <code>.env.local</code> (see <code>SETUP.md</code>) and reload.
      </p>
    </main>
  );
}
