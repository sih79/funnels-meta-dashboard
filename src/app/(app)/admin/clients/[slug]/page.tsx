import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAdminClientDetail, getTrackedConversionsForAccount } from "@/lib/admin/data";
import AddAdAccountForm from "@/components/admin/AddAdAccountForm";
import BackfillButton from "@/components/admin/BackfillButton";
import InviteLoginForm from "@/components/admin/InviteLoginForm";
import ConversionPickerRow from "@/components/admin/ConversionPickerRow";

// Manage one client: its ad accounts (+ last sync), client logins, and the
// forms to add more. Staff-only. params is a Promise in Next 16 — await it.
export const dynamic = "force-dynamic";

export default async function ManageClientPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-white">Set up Supabase first</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Add your Supabase keys to <code>.env.local</code> (see{" "}
          <code>SETUP.md</code>) to manage clients.
        </p>
      </main>
    );
  }

  await requireStaff();

  const detail = await getAdminClientDetail(slug);
  if (!detail) notFound();

  const { client, adAccounts, logins } = detail;

  // Load tracked conversions for every ad account in parallel so the picker
  // shows up inline with each account.
  const conversionsByAccount = new Map(
    await Promise.all(
      adAccounts.map(
        async (a) =>
          [a.id, await getTrackedConversionsForAccount(a.id)] as const,
      ),
    ),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <Link
          href="/admin"
          className="text-xs font-medium text-neutral-500 transition hover:text-amber-400"
        >
          ← All clients
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{client.name}</h1>
          <Link
            href={`/clients/${client.slug}`}
            className="rounded-lg border border-white/10 px-3 py-1 text-xs font-medium text-neutral-300 transition hover:border-amber-400/40 hover:text-white"
          >
            View dashboard
          </Link>
        </div>
        <p className="mt-1 text-sm text-neutral-500">/{client.slug}</p>
      </header>

      {/* Ad accounts */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-white">Ad accounts</h2>

        {adAccounts.length === 0 ? (
          <p className="mb-6 rounded-xl border border-white/10 bg-neutral-900/50 p-4 text-sm text-neutral-400">
            No ad accounts connected yet. Add one below.
          </p>
        ) : (
          <ul className="mb-6 space-y-3">
            {adAccounts.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-white/10 bg-neutral-900/50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-white">{a.name}</p>
                    <p className="text-xs text-neutral-500">
                      {a.metaAccountId} · {a.source} · {a.currency} · {a.status}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {a.lastSyncAt
                      ? `Last sync: ${formatSync(a.lastSyncAt)}${
                          a.lastSyncStatus ? ` (${a.lastSyncStatus})` : ""
                        }`
                      : "Never synced"}
                  </span>
                </div>

                {/* Agency accounts can be backfilled from the shared token. */}
                {a.source === "agency" && (
                  <div className="mt-3 border-t border-white/5 pt-3">
                    <BackfillButton adAccountId={a.id} slug={client.slug} />
                  </div>
                )}

                {/* Conversion picker — admin chooses which Meta action_types
                    surface in this account's dashboard KPIs + tables. */}
                <div className="mt-4 border-t border-white/5 pt-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-400">
                    Conversions
                  </h4>
                  {(() => {
                    const conversions = conversionsByAccount.get(a.id) ?? [];
                    if (conversions.length === 0) {
                      return (
                        <p className="rounded-lg border border-white/10 bg-neutral-900/40 p-3 text-sm text-neutral-400">
                          No conversions discovered yet. Run a backfill or wait
                          for the next sync — every Meta action_type and Custom
                          Conversion will appear here automatically.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {conversions.map((c) => (
                          <ConversionPickerRow
                            key={c.id}
                            id={c.id}
                            actionType={c.actionType}
                            metaName={c.metaName}
                            displayName={c.displayName}
                            isEnabled={c.isEnabled}
                            displayOrder={c.displayOrder}
                            slug={client.slug}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border border-white/10 bg-neutral-900/50 p-6">
          <h3 className="mb-4 text-base font-semibold text-white">
            Connect an ad account
          </h3>
          <AddAdAccountForm clientId={client.id} slug={client.slug} />
        </div>
      </section>

      {/* Client logins */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Client logins</h2>

        {logins.length === 0 ? (
          <p className="mb-6 rounded-xl border border-white/10 bg-neutral-900/50 p-4 text-sm text-neutral-400">
            No client logins yet. Invite one below.
          </p>
        ) : (
          <ul className="mb-6 space-y-2">
            {logins.map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-white/10 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-300"
              >
                {l.fullName ?? "Client login"}{" "}
                <span className="text-xs text-neutral-600">({l.id})</span>
              </li>
            ))}
          </ul>
        )}

        <div className="max-w-md rounded-xl border border-white/10 bg-neutral-900/50 p-6">
          <h3 className="mb-4 text-base font-semibold text-white">
            Invite a client login
          </h3>
          <InviteLoginForm clientId={client.id} slug={client.slug} />
        </div>
      </section>
    </main>
  );
}

// Human-friendly "last sync" timestamp.
function formatSync(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
