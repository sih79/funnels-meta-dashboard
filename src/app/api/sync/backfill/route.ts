import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { backfillAdAccount, BACKFILL_DAYS } from "@/lib/sync";

// Manual backfill endpoint. Pulls a long history (default 90 days) for ONE ad
// account. Used in Phase 5 right after an account is added so its cache starts
// fully populated. Same secret auth as /api/sync.
//
//   GET /api/sync/backfill?accountId=<uuid>&secret=<CRON_SECRET>
//   (or Authorization: Bearer <CRON_SECRET>)
// Optional &days=<n> to override the window.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const qs = req.nextUrl.searchParams.get("secret");
  return qs === secret;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured (see SETUP.md)." },
      { status: 503 },
    );
  }

  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json(
      { error: "Missing required ?accountId=<ad_accounts.id uuid>" },
      { status: 400 },
    );
  }

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.max(1, Number(daysParam)) : BACKFILL_DAYS;

  try {
    const result = await backfillAdAccount(accountId, { days });
    if (!result) {
      return NextResponse.json(
        { error: `No ad account found with id ${accountId}` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, days, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown backfill error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
