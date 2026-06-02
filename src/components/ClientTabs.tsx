"use client";

// Horizontal tab strip for staff/admin: one tab per accessible client. The
// active tab is derived from the current pathname (/clients/<slug>). Clicking a
// tab routes to that client's dashboard; preset/custom range params are NOT
// carried across clients (each client starts on its default range).

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccessibleClient } from "@/lib/dashboard";

export default function ClientTabs({ clients }: { clients: AccessibleClient[] }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-white/10">
      <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {clients.map((c) => {
          const href = `/clients/${c.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={c.id}
              href={href}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
                active
                  ? "border-amber-400 text-amber-300"
                  : "border-transparent text-neutral-400 hover:text-white"
              }`}
            >
              {c.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
