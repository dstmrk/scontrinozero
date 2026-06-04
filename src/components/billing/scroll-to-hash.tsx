"use client";

import { useEffect } from "react";

/**
 * Scrolla, dopo il mount, all'elemento il cui `id` corrisponde a
 * `window.location.hash`.
 *
 * Perché serve: lo scroll-to-hash dell'App Router non scatta in modo affidabile
 * sulle navigazioni *soft* (`<Link>`) verso una route diversa. Navigando da
 * catalogo/cassa/annullo (o dal gate Pro / export CSV) a
 * `/dashboard/settings#billing`, Next aggiorna l'URL ma non porta lo scroll alla
 * card "Piano e Abbonamento", anche se l'ancora `#billing` è già nell'HTML
 * server-rendered. Eseguendo lo scroll lato client al mount copriamo sia la
 * soft-navigation sia il reload, e ogni deep-link verso `BILLING_SETTINGS_HREF`
 * atterra sulla sezione giusta.
 *
 * Generico: scrolla a qualunque hash presente, non solo `#billing`.
 */
export function ScrollToHash() {
  useEffect(() => {
    const { hash } = window.location;
    if (!hash) return;
    const raw = hash.slice(1);
    // Fragment malformato (es. `#%E0%A4%A`) → decodeURIComponent lancia URIError:
    // degradare al raw invece di propagare (regola 19, no error boundary).
    let id: string;
    try {
      id = decodeURIComponent(raw);
    } catch {
      id = raw;
    }
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  return null;
}
