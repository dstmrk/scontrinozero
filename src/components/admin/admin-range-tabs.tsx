import Link from "next/link";

import { cn } from "@/lib/utils";
import type { AnalyticsRange } from "@/server/analytics-helpers";

/**
 * Selettore di periodo del pannello operatore.
 *
 * Link, non `<Select>`: la pagina è interamente server-rendered e cambiare
 * periodo è una navigazione: così il periodo resta bookmarkabile, il pannello
 * non spedisce JavaScript e Next può prefetchare le altre finestre. È lo stesso
 * insieme di range dell'analytics esercente (`AnalyticsRange`) — un secondo
 * vocabolario di periodi renderebbe i due pannelli non confrontabili.
 */
const RANGES: ReadonlyArray<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "7 giorni" },
  { value: "30d", label: "30 giorni" },
  { value: "90d", label: "90 giorni" },
  { value: "ytd", label: "Da inizio anno" },
];

interface AdminRangeTabsProps {
  readonly active: AnalyticsRange;
}

export function AdminRangeTabs({ active }: AdminRangeTabsProps) {
  return (
    <nav aria-label="Periodo" className="flex flex-wrap gap-1">
      {RANGES.map(({ value, label }) => (
        <Link
          key={value}
          href={`/admin?range=${value}`}
          aria-current={value === active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            value === active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
