"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, ShoppingCart, History, Settings } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Catalogo",
    icon: Package,
    /** Attivo solo su /dashboard esatto (non su sub-route) */
    exact: true,
  },
  {
    href: "/dashboard/cassa",
    label: "Cassa",
    icon: ShoppingCart,
    exact: false,
  },
  {
    href: "/dashboard/storico",
    label: "Storico",
    icon: History,
    exact: false,
  },
  {
    href: "/dashboard/settings",
    label: "Impostazioni",
    icon: Settings,
    exact: false,
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-background fixed right-0 bottom-0 left-0 z-50 border-t md:hidden">
      <ul className="flex h-16 items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname.startsWith(href);

          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
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
