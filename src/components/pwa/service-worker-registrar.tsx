"use client";

import { useSerwist } from "@serwist/next/react";
import { useEffect } from "react";

/**
 * Registra il service worker al posto di `SerwistProvider`, che lo fa con un
 * `void window.serwist.register()` — fire-and-forget, senza catch: **qualsiasi**
 * rigetto di `navigator.serviceWorker.register()` finisce diritto in
 * `window.onunhandledrejection` e da lì in Sentry come `Error: Rejected`
 * non gestito (issue SCONTRINOZERO-X, arrivata dal renderer di Googlebot su
 * `/guide/sanzioni-mancato-scontrino`).
 *
 * La registrazione può fallire per motivi che non sono bug nostri e che non
 * hanno alcun rimedio applicativo: crawler che stubbano l'API (il Web
 * Rendering Service di Google rigetta sempre), navigazione privata di Firefox,
 * service worker disabilitati da policy o estensione, quota di storage esaurita.
 * In tutti questi casi l'app funziona: si perde solo l'offline. Assorbiamo il
 * rigetto con un `console.warn` (breadcrumb in Sentry, non un evento) invece di
 * lasciarlo diventare rumore.
 *
 * Non stiamo nascondendo la regressione di REVIEW #84 (`/sw.js` 404): quella
 * classe è coperta a monte da `scripts/check-service-worker.mjs` nello script
 * di build e dal test sul matcher di `src/proxy.ts`, non da Sentry.
 *
 * `register()` di `@serwist/window` attende comunque l'evento `load` prima di
 * registrare, quindi spostarla da render a `useEffect` non cambia i tempi.
 */
export function ServiceWorkerRegistrar() {
  const { serwist } = useSerwist();

  useEffect(() => {
    // `null` in SSR, con `disable` attivo (sviluppo) o su un browser senza
    // `navigator.serviceWorker`.
    if (!serwist) return;

    serwist.register().catch((error: unknown) => {
      console.warn("[pwa] registrazione del service worker fallita", error);
    });
  }, [serwist]);

  return null;
}
