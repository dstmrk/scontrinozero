"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, ShoppingCart, History, BarChart2 } from "lucide-react";

// `tourStep`: ancora per l'onboarding tour (PLAN.md v1.4.1). Questa è la nav
// mobile (dentro `[data-tour-nav="mobile"]`); il tour la usa quando il viewport
// è < md. Impostazioni su mobile è l'icona ingranaggio nell'header del layout
// (`[data-tour-step="settings-mobile"]`), non in bottom-nav.
const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Catalogo",
    icon: Package,
    /** Attivo solo su /dashboard esatto (non su sub-route) */
    exact: true,
    tourStep: "catalogo",
  },
  {
    href: "/dashboard/cassa",
    label: "Cassa",
    icon: ShoppingCart,
    exact: false,
    tourStep: "cassa",
  },
  {
    href: "/dashboard/storico",
    label: "Storico",
    icon: History,
    exact: false,
    tourStep: "storico",
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: BarChart2,
    exact: false,
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      data-tour-nav="mobile"
      className="bg-background fixed right-0 bottom-0 left-0 z-50 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {NAV_ITEMS.map((item) => {
          const { href, label, icon: Icon, exact } = item;
          const isActive = exact
            ? pathname === href
            : pathname.startsWith(href);

          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                data-tour-step={"tourStep" in item ? item.tourStep : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : "stroke-2"}`}
                />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
