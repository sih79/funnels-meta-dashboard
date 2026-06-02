import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { syncAllAgencyAccounts, INCREMENTAL_DAYS } from "@/lib/sync";

// Background sync endpoint. Hit by Vercel Cron (see vercel.json) every 15 min,
// or manually with the secret. Pulls the last few days of Meta data for every
// active agency account into the Supabase cache.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` header (Vercel Cron sends this
// automatically) OR `?secret=<CRON_SECRET>` for easy manual triggering.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min — syncing many accounts is slow.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured => deny (fail closed)

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
      {
        error: "Supabase is not configured. Set the SUPABASE env vars (see SETUP.md).",
      },
      { status: 503 },
    );
  }

  try {
    const summary = await syncAllAgencyAccounts({ days: INCREMENTAL_DAYS });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
