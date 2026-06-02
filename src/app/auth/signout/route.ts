// Sign-out route handler. POST here to clear the Supabase session and bounce to
// /login. A Route Handler (not a Server Component) is used because cookies can
// be written here — sign-out clears the auth cookies.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    // Best-effort: even if there's no active session this is a no-op.
    await supabase.auth.signOut();
  }

  // Redirect with 303 so the browser issues a GET to /login after the POST.
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}
