// Next.js 16 Proxy (the renamed `middleware` convention — see
// node_modules/next/dist/docs/.../03-file-conventions/proxy.md). The file must
// live at the project root or under src/, alongside the app/ directory, and
// export a function named `proxy` (or a default export).
//
// Its only job here: refresh the Supabase auth session on every matched
// request and redirect unauthenticated users away from protected pages.

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request EXCEPT:
     *  - _next/static, _next/image (build assets / image optimizer)
     *  - favicon.ico and common static image/font file extensions
     * Note: /login, /auth, /demo and /api are matched here but treated as
     * public inside updateSession(), so the session still refreshes there
     * without forcing a redirect.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
