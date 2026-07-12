---
name: pwa-serwist
description: Use when working on the PWA — the service worker src/sw.ts (Serwist defaultCache runtime caching, why Cache-Control no-store is NOT enough, NetworkOnly overrides for /api/* GET), install prompt capture (beforeinstallprompt race on Android, singleton store src/lib/pwa/install-prompt-store.ts, useSyncExternalStore consumers in src/components/pwa/), or the src/proxy.ts matcher exclusions for /sw.js and /manifest.webmanifest. Also covers testing the matcher regex and resetting the install-prompt singleton between tests.
---

# pwa-serwist — service worker, install prompt, matcher

## Serwist — attenzione al `defaultCache`

Il service worker (`src/sw.ts`) usa `runtimeCaching: defaultCache` di
`@serwist/next/worker`. **Non è asset-only:** `defaultCache` include strategie
di runtime caching anche per same-origin GET, tra cui una `NetworkFirst` per
le richieste `/api/*`. Conseguenze:

- **Server Action (POST)** → non cachate, sempre rete.
- **Route Handler GET sotto `/api/*`** → potenzialmente serviti dalla cache
  su timeout/offline. ⚠️ `Cache-Control: no-store` sulla response **non
  basta**: in Serwist 9.x la `NetworkFirst` scrive in cache via
  `fetchAndCachePut`, e il `cacheOkAndOpaquePlugin` aggiunto di default
  decide solo in base allo status (200/opaque) ignorando l'header
  `Cache-Control`. Per dati tenant-specifici / sensibili / che cambiano
  spesso bisogna **override esplicito** in `src/sw.ts`: una regola
  `NetworkOnly` (o un matcher che esclude il pattern) registrata **prima**
  di `defaultCache`, oppure una `NetworkFirst` con plugin custom che rifiuta
  via `cacheWillUpdate` le response non cacheable. `Vary: Cookie/Authorization`
  da solo non previene la scrittura in cache, al massimo isola la voce per
  variante.
- **Pagine / RSC payload** → cachate con strategia network-first analoga;
  per route autenticate fare affidamento su `cookies()`/redirect server-side,
  non su "il SW non interferisce".

`src/components/pwa/` contiene gli hook lato client per install prompt e
update detection — sono Client Components che usano `window.matchMedia` e
listener `beforeinstallprompt`. Da non importare in Server Component.

## `beforeinstallprompt` — race del listener tardivo (Android)

Chrome su Android emette `beforeinstallprompt` **molto presto** dopo il load
(appena manifest + SW sono pronti) e **non lo ri-emette**. Se il listener è
agganciato in una `useEffect` di un componente annidato — es. il banner
montato in fondo al `dashboard/layout.tsx`, che è un Server Component `async`
con `await` bloccanti prima del render — l'evento può scattare prima che React
idrati e l'evento è perso → su Android il pulsante "Installa" non compare mai,
mentre iOS (istruzioni statiche, niente evento) sembra funzionare. Asimmetria
sintomatica.

**Fix (commit PWA Android):** cattura l'evento in uno store singleton client
(`src/lib/pwa/install-prompt-store.ts`) il cui `initInstallPromptCapture()` è
chiamato a module-load da `Providers` (entry client condiviso del root layout,
ben prima del mount del banner). Idempotente + SSR-safe. La UI legge via
`useSyncExternalStore(subscribe, getDeferredPrompt, () => null)`, così vede
anche un evento già bufferizzato. `getSnapshot` deve restituire un riferimento
stabile (il module var), altrimenti loop di render. Reset del singleton tra
test con `resetInstallPromptStoreForTests()`.

## Asset PWA esclusi dal `proxy.ts` matcher

`/sw.js` e `/manifest.webmanifest` **devono** stare nel negative-lookahead del
`config.matcher` di `src/proxy.ts` (come `_next/static`, favicon, ecc.): un
service worker che riceve un 3xx fallisce la registrazione, e far girare
`supabase.auth.getUser()` su ogni fetch di questi file è spreco puro.
Estensioni `.js`/`.webmanifest` non sono coperte dalla lista asset statici
(`svg|png|...`), quindi vanno aggiunte esplicitamente
(`sw\.js|manifest\.webmanifest`). Test: costruire
`new RegExp(\`^${config.matcher[0]}$\`)` e asserire che NON matcha gli asset
PWA ma sì le route app.

## Componenti React attorno alla PWA

Per pattern Server/Client Component, hydration e TanStack Query → skill
`react-patterns`.
