"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { AnalyticsRange } from "@/server/analytics-helpers";

/**
 * Selettore di periodo del pannello amministratore.
 *
 * `<Link>` e non un `router.push` manuale: il periodo resta bookmarkabile e
 * Next prefetcha le altre finestre. È lo stesso insieme di range
 * dell'analytics esercente (`AnalyticsRange`) — un secondo vocabolario di
 * periodi renderebbe i due pannelli non confrontabili.
 *
 * L'unico stato di questo Client Component è quale tab **sembra**
 * selezionata. Serve perché la navigazione di Next è un transition: React
 * tiene il contenuto vecchio — tab evidenziata compresa, se dipendesse solo
 * dalla prop `active` — finché il nuovo non è pronto, cioè finché le dieci
 * query dietro ai `<Suspense>` di `admin/page.tsx` non hanno risposto. Senza
 * questo stato locale un click non dava alcun feedback fino a query finita:
 * la tab attiva e lo skeleton delle card sono due problemi distinti (la
 * seconda metà vive in `admin/page.tsx`, `key={range}` sui boundary che
 * dipendono dal periodo), risolti qui da due pezzi distinti.
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
  const [prevActive, setPrevActive] = useState(active);
  const [displayedActive, setDisplayedActive] = useState(active);

  // Risincronizza quando la navigazione finisce e la pagina rimonta con la
  // prop aggiornata — copre anche back/forward del browser, che non passa
  // per l'onClick qui sotto. Aggiustamento in render ("adjusting state during
  // render", non un useEffect) per evitare il render extra di un effetto che
  // scatta dopo il commit.
  if (active !== prevActive) {
    setPrevActive(active);
    setDisplayedActive(active);
  }

  return (
    <nav aria-label="Periodo" className="flex flex-wrap gap-1">
      {RANGES.map(({ value, label }) => (
        <Link
          key={value}
          href={`/admin?range=${value}`}
          onClick={() => setDisplayedActive(value)}
          aria-current={value === displayedActive ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            value === displayedActive
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
