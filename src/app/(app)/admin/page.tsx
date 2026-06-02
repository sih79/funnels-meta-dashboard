import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAdminClients } from "@/lib/admin/data";
import AddClientForm from "@/components/admin/AddClientForm";

// Admin landing: manage all clients. Staff-only. force-dynamic because it
// reads the session + live DB on every request.
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  // Gate first — redirects non-staff away. Skipped only when Supabase is off
  // (offline build), where we show a setup message instead.
  if (isSupabaseConfigured()) {
    await requireStaff();
  } else {
    return <NotConfigured />;
  }

  const clients = await getAdminClients();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          Admin
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">Manage clients</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Add clients, connect their Meta ad accounts and invite their logins.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        {/* Client list */}
        <section>
          {clients.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-neutral-900/50 p-6 text-sm text-neutral-400">
              No clients yet. Add your first one using the form.
            </div>
          ) : (
            <ul className="space-y-3">
              {clients.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      /{c.slug} · {c.adAccountCount}{" "}
                      {c.adAccountCount === 1 ? "ad account" : "ad accounts"}
                    </p>
                  </div>
                  <Link
                    href={`/admin/clients/${c.slug}`}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-neutral-300 transition hover:border-amber-400/40 hover:text-white"
                  >
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Add a client */}
        <section className="rounded-xl border border-white/10 bg-neutral-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Add a client</h2>
          <AddClientForm />
        </section>
      </div>
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
