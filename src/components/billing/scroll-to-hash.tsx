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
    const id = decodeURIComponent(hash.slice(1));
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  return null;
}
