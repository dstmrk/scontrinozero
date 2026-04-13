"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/cassa", label: "Cassa", exact: false },
  { href: "/dashboard/storico", label: "Storico", exact: false },
  { href: "/dashboard/settings", label: "Impostazioni", exact: false },
] as const;

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`text-sm transition-colors ${
              isActive
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
