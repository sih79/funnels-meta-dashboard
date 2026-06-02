// Session-refresh helper for the Next.js 16 Proxy (formerly "middleware").
//
// This is the ONE place a Supabase session can be refreshed and written back
// as cookies on every request. Server Components cannot write cookies, so the
// proxy must do it — otherwise an expired access token never gets rotated and
// the user appears logged out.
//
// Pattern adapted from Supabase's official Next.js SSR guide, but wired to:
//   - the @supabase/ssr getAll/setAll cookie interface, and
//   - Next 16's NextRequest/NextResponse cookie APIs.
//
// IMPORTANT (per Supabase docs): always return the EXACT `response` object we
// mutate here, and never run logic between createServerClient() and
// getUser() — doing so risks desyncing the session and randomly logging users
// out.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./env";
import type { Database } from "./db.types";

// Paths that are always reachable without a session.
const PUBLIC_PREFIXES = ["/login", "/auth", "/demo", "/api"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  // If Supabase isn't configured (e.g. local build / demo-only), do nothing.
  // The app still works against the public demo dashboard.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  // This response is what we ultimately return. We keep it in sync with any
  // cookies Supabase wants to set during token refresh.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies onto BOTH the request (so downstream sees
          // them) and a fresh response we return.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do NOT put any logic between client creation and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route protection: unauthenticated requests to a protected page get bounced
  // to /login (with a ?next= so we can return them afterwards). Public paths
  // and the login/auth routes are exempt.
  const { pathname } = request.nextUrl;
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
