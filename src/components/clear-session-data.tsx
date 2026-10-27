"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CASSA_SESSION_KEY } from "@/hooks/use-cassa";
import { safeSessionStorage } from "@/lib/safe-storage";

/**
 * Cache runtime del service worker che tengono pagine e payload RSC del
 * dashboard: le `NetworkFirst` di `defaultCache` di `@serwist/next`
 * (`src/sw.ts`). Le `/api/*` non ci finiscono, sono `NetworkOnly`.
 */
const USER_PAGE_CACHES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
] as const;

/**
 * Pulisce ciò che resta di una sessione nel browser. Da montare sulle pagine
 * raggiungibili solo senza sessione (login/register/reset-password/
 * verify-email/invito), dove si arriva al logout e alla scadenza della
 * sessione:
 *
 * - il carrello in sessionStorage, che passerebbe a chi accede dopo nella
 *   stessa tab;
 * - la cache di TanStack Query, che vive nel provider del root layout e
 *   sopravvive alla navigazione verso /login;
 * - le cache del service worker con le pagine del dashboard, servite offline
 *   o a rete lenta.
 *
 * Sul tablet condiviso fra più collaboratori (issue #1099) chi entra dopo non
 * vede così storico e cassa di chi è uscito.
 */
export function ClearSessionData(): null {
  const queryClient = useQueryClient();

  useEffect(() => {
    // safeSessionStorage degrada a no-op se lo storage è inaccessibile
    // (privacy/cookie disabilitati → SecurityError sul solo accesso alla
    // property, Sentry SCONTRINOZERO-H). Storage non disponibile = nessun
    // carrello persistito da ripulire: il no-op è semanticamente corretto.
    safeSessionStorage.removeItem(CASSA_SESSION_KEY);
    queryClient.clear();
    void clearUserPageCaches();
  }, [queryClient]);

  return null;
}

async function clearUserPageCaches(): Promise<void> {
  // CacheStorage manca fuori da un contesto sicuro e sui browser senza
  // service worker: lì non c'è nulla da pulire.
  const storage = (globalThis as { caches?: CacheStorage }).caches;
  if (!storage) return;
  await Promise.all(
    USER_PAGE_CACHES.map((name) => storage.delete(name).catch(() => false)),
  );
}
