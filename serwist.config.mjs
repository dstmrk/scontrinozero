/**
 * Config del service worker per `@serwist/cli` (configurator mode).
 *
 * Perché non il plugin `withSerwistInit` in `next.config.ts`: quello è un
 * plugin **webpack**, e Next 16 builda con Turbopack. Non girava, degradava a
 * warning, e il SW non veniva emesso senza rompere il build — REVIEW #84.
 * La configurator mode non si aggancia al bundler: è uno step di build a sé,
 * quindi sopravvive a Turbopack e a qualunque bundler venga dopo.
 *
 * Gira DOPO `next build` (vedi lo script `build` in package.json): il precache
 * manifest è generato dagli asset già emessi in `.next/` e `public/`.
 *
 * `serwist.withNextConfig` legge la config Next risolta (distDir, basePath,
 * assetPrefix) e ne deriva glob patterns, ignores e i manifest transforms che
 * mappano i path di build su URL pubblici. A noi restano sorgente e
 * destinazione.
 */

import { generateGlobPatterns, serwist } from "@serwist/next/config";

export default serwist.withNextConfig((nextConfig) => {
  // Stessa normalizzazione che applica il configurator internamente: ".next"
  // deve diventare ".next/" perché i glob sono per-prefisso.
  const distDir = `${nextConfig.distDir.replace(/^\//, "").replace(/\/?$/, "")}/`;

  return {
    swSrc: "src/sw.ts",
    swDest: "public/sw.js",

    // I default precacherebbero ~12 MB, di cui 8.3 MB di marketing: 5.3 MB di
    // HTML SSG (89 pagine fra landing, /help e /guide) e 3 MB di screenshot
    // del prodotto. Un esercente che installa la PWA vive in /dashboard — che
    // è dinamica, quindi nemmeno precacheabile — e quei byte se li scarica in
    // 4G al primo caricamento senza usarli mai. Contro i principi del progetto
    // (mobile-first, "leggeri sulle risorse"): precachiamo solo l'app shell.
    //
    // Le pagine marketing NON restano scoperte: la `NetworkFirst` per le
    // navigazioni di `defaultCache` le cacha comunque a runtime, ma solo
    // quelle davvero visitate — che è la strategia giusta per 89 pagine di cui
    // un utente ne aprirà due.
    precachePrerendered: false,
    globPatterns: [
      ...generateGlobPatterns(distDir),
      // Unica pagina prerenderizzata che DEVE stare nel precache: è il
      // fallback di navigazione dichiarato in src/sw.ts, e per definizione
      // serve quando la rete non c'è. I manifest transforms del configurator
      // la mappano su "/offline".
      `${distDir}server/app/offline.html`,
    ],
    globIgnores: ["public/screenshots/**"],
  };
});
