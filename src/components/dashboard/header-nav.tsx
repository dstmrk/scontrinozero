"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// `tourStep`: ancora per l'onboarding tour (PLAN.md v1.4.1). Questa è la nav
// desktop (montata dentro `[data-tour-nav="desktop"]` nel layout); il tour la
// usa quando il viewport è ≥ md.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Catalogo", exact: true, tourStep: "catalogo" },
  { href: "/dashboard/cassa", label: "Cassa", exact: false, tourStep: "cassa" },
  {
    href: "/dashboard/storico",
    label: "Storico",
    exact: false,
    tourStep: "storico",
  },
  { href: "/dashboard/analytics", label: "Analytics", exact: false },
  {
    href: "/dashboard/settings",
    label: "Impostazioni",
    exact: false,
    tourStep: "settings",
  },
] as const;

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const { href, label, exact } = item;
        const isActive = exact ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            data-tour-step={"tourStep" in item ? item.tourStep : undefined}
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
