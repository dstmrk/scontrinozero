"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsCollaborator } from "./member-role";

// `tourStep`: ancora per l'onboarding tour (v1.4.1). Questa è la nav
// desktop (montata dentro `[data-tour-nav="desktop"]` nel layout); il tour la
// usa quando il viewport è ≥ md. `ownerOnly`: voce nascosta al collaboratore
// (issue #1099).
const NAV_ITEMS = [
  { href: "/dashboard", label: "Catalogo", exact: true, tourStep: "catalogo" },
  { href: "/dashboard/cassa", label: "Cassa", exact: false, tourStep: "cassa" },
  {
    href: "/dashboard/storico",
    label: "Storico",
    exact: false,
    tourStep: "storico",
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    exact: false,
    ownerOnly: true,
  },
  {
    href: "/dashboard/settings",
    label: "Impostazioni",
    exact: false,
    tourStep: "settings",
  },
] as const;

export function HeaderNav() {
  const pathname = usePathname();
  const isCollaborator = useIsCollaborator();
  const items = NAV_ITEMS.filter(
    (item) => !(isCollaborator && "ownerOnly" in item),
  );

  return (
    <>
      {items.map((item) => {
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
