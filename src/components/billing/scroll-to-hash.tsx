"use client";

import { useEffect } from "react";
import { readHashId } from "@/lib/hash-target";

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
 *
 * Copre le sole ancore già presenti nell'HTML server-rendered. Un target che
 * vive dentro una sezione collassata non è nel DOM quando questo effect gira:
 * lì l'apertura e lo scroll li fa la sezione stessa (`ExtraSettingsSection`),
 * sulla stessa lettura dell'hash — `readHashId`.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = readHashId();
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  return null;
}
