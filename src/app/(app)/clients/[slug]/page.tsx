import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getAccessibleClients,
  getClientDashboard,
} from "@/lib/dashboard";
import { resolveRange } from "@/lib/dateRange";
import ClientDashboard from "@/components/ClientDashboard";
import ClientTabs from "@/components/ClientTabs";

// Per-client dashboard. params + searchParams are Promises in Next 16 — await
// both. force-dynamic because this reads the session + per-request query.
export const dynamic = "force-dynamic";

type ParamValue = string | string[] | undefined;

export default async function ClientDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
}) {
  await requireUser();

  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  // The accessible set drives both access control and whether we show tabs.
  const clients = await getAccessibleClients();
  const client = clients.find((c) => c.slug === slug);

  // Not found OR not allowed (a client user requesting another client's slug)
  // → 404. RLS would also block the data read, but failing here is cleaner.
  if (!client) notFound();

  const range = resolveRange(sp);
  const data = await getClientDashboard(client.id, {
    since: range.since,
    until: range.until,
  });

  // getClientDashboard only returns null when access is denied (already handled
  // above) or Supabase is unconfigured (the (app) layout would have redirected
  // / shown the setup message). Treat as 404 defensively.
  if (!data) notFound();

  // Staff with more than one client get the tab strip; single-client users
  // (the common case for a client login) don't need it.
  const showTabs = clients.length > 1;

  return (
    <>
      {showTabs && <ClientTabs clients={clients} />}
      <ClientDashboard data={data} clientName={client.name} range={range} />
    </>
  );
}
