---
name: pwa-serwist
description: Use when working on the PWA — the service worker src/sw.ts (Serwist defaultCache runtime caching, why Cache-Control no-store is NOT enough, NetworkOnly overrides for /api/* GET), install prompt capture (beforeinstallprompt race on Android, singleton store src/lib/pwa/install-prompt-store.ts, useSyncExternalStore consumers in src/components/pwa/), or the src/proxy.ts matcher exclusions for /sw.js and /manifest.webmanifest. Also covers testing the matcher regex and resetting the install-prompt singleton between tests.
---

# pwa-serwist — service worker, install prompt, matcher

## Come viene costruito il SW: configurator mode, NON un plugin

Il service worker **non** è costruito da un plugin dentro `next.config.ts`. Lo
era (`withSerwistInit`), ma quello è un plugin **webpack** e Next 16 builda con
**Turbopack**: non girava, degradava a un **warning**, e il build restava verde
senza emettere nulla. Risultato: `/sw.js` 404 in produzione per mesi — niente
offline, niente `beforeinstallprompt`, quindi niente installazione su Android
(iOS non è colpito, il che rendeva l'asimmetria fuorviante). Era REVIEW #84.

Oggi la catena è esplicita e bundler-agnostica:

```
npm run build → next build && npm run build:sw
                              └─ serwist build serwist.config.mjs
                                 └─ node scripts/check-service-worker.mjs
```

- `serwist.config.mjs` usa `serwist.withNextConfig(...)` dall'export `./config`
  di `@serwist/next` + il CLI `@serwist/cli` (devDependency). Non si aggancia al
  bundler: gira **dopo** `next build` e legge gli asset già emessi.
- È incatenato allo script `build` di `package.json`, non a un workflow CI —
  così vale anche per il Dockerfile.
- `scripts/check-service-worker.mjs` fallisce se il bundle manca o è sotto 1 KB.

> **Lezione, generalizzabile oltre il SW:** un tool di build che degrada a
> warning invece di fallire è **indistinguibile dal successo** in CI. Quando una
> feature dipende da un artefatto generato, l'unica verifica che tiene è
> asserire l'esistenza dell'**artefatto**; verificare il sorgente che lo produce
> non basta, perché il produttore può smettere di girare del tutto.

### Cosa finisce nel precache (e cosa no)

I default del configurator precacherebbero **~12 MB**: 5.3 MB di HTML SSG (89
pagine fra landing, `/help` e `/guide`), 3 MB di screenshot prodotto, 3.2 MB di
app shell. Su un target mobile-first di micro-esercenti sono 8.3 MB di roba
marketing scaricata in 4G e mai usata offline — chi installa la PWA vive in
`/dashboard`, che è dinamica e nemmeno precacheabile.

Perciò `serwist.config.mjs` imposta `precachePrerendered: false` e ignora
`public/screenshots/**`: **3.55 MB, 67 URL**. Le pagine marketing non restano
scoperte, le cacha comunque a runtime la `NetworkFirst` delle navigazioni di
`defaultCache` — ma solo quelle davvero visitate.

⚠️ L'unica pagina prerenderizzata che **deve** restare nel precache è
`/offline`: è il fallback di navigazione dichiarato in `src/sw.ts` e serve per
definizione quando la rete non c'è. È aggiunta esplicitamente ai `globPatterns`.
Se tocchi i glob, verifica che `"/offline"` sia ancora nel manifest generato.

### Lint sul bundle generato

`public/sw.js` è un bundle esbuild minificato: va tenuto nei `globalIgnores` di
`eslint.config.mjs` (insieme alla sua `.map`). Prima di #84 non veniva mai
emesso, quindi non era mai presente nel working tree e il problema non si era
mai visto.

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

> ✅ **Stato oggi: l'override è implementato** (fix REVIEW.md #73). `src/sw.ts`
> costruisce `runtimeCaching` con una regola `NetworkOnly` su
> `sameOrigin && (pathname.startsWith("/api/") || pathname.startsWith("/v1/"))`
> **prima** dello spread di `defaultCache`. `/v1/` c'è perché è il path
> pre-rewrite del subdomain API (`next.config.ts` → `rewrites()`): dimenticarlo
> lascerebbe scoperta la Developer API. La pagina pubblica `/r/<id>` è
> **volutamente** fuori dall'override (non autenticata, nessun leak
> cross-account, offline è un vantaggio).
>
> **L'ordine è la sostanza:** vince il primo matcher, quindi una regola messa
> dopo `...defaultCache` non intercetterebbe nulla. Il test `src/sw.test.ts`
> pinna posizione, matcher e la presenza di `defaultCache` dopo l'override.
>
> `src/sw.ts` resta escluso da `sonar.exclusions` ma **non** dalla coverage
> (`vitest.config.ts`). Per testarlo: `vi.stubGlobal("self", { __SW_MANIFEST })`
> prima dell'import (in environment node `self` non esiste), e le classi mockate
> (`Serwist`, `NetworkOnly`) vanno definite dentro `vi.hoisted`, non nel factory
> di `vi.mock` — il factory viene ri-valutato e una classe definita lì dentro
> avrebbe identità diversa da quella vista dal test, facendo fallire ogni
> `instanceof`.

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
