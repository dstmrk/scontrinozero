---
name: security-patterns
description: Use when implementing or reviewing security-sensitive boundaries — reading client IP (CF-Connecting-IP), rate limiting (single or double-gate with Turnstile), validating UUIDs/emails/decimals/hostnames/redirect params at API boundaries, enforcing body size limits before JSON.parse, wrapping external SDK calls (Stripe, AdE, Resend) in try-catch returning 503, configuring CSP/security headers in src/lib/security-headers.ts, normalizing emails in auth flows, building lookups from user-controlled keys (prototype pollution), or calling setInterval in long-lived constructors. Also covers the Turnstile hostname allowlist for app vs marketing domains.
---

# security-patterns — IP trust, rate limit, hostname, CSP, input validation

Pattern di sicurezza per route handler, server actions e middleware.

Indice (salta alla sezione che serve, non leggere tutto):

- Client IP: `CF-Connecting-IP` unica sorgente fidata
- Retry + backoff per operazioni con orphan state
- UUID validation ai boundary
- Hostname validation link Supabase (URL parsing vs `startsWith`)
- Body size guard prima di `JSON.parse`
- Decimal precision all'API layer
- Email normalisation su tutti gli auth flow
- Wrap SDK esterni in try-catch → 503
- Lookup `Record` con key user-controlled (prototype pollution)
- CSP: lezioni dal rollout
- Double-gate rate limit prima di call esterne costose
- `setInterval` + `.unref?.()`
- Redirect param con querystring
- Turnstile hostname check a lista
- Sentry Logs: denylist + `release`

---

## Client IP: `CF-Connecting-IP` è l'UNICA sorgente fidata

Con Cloudflare Tunnel davanti all'app, solo `CF-Connecting-IP` è impostato da
Cloudflare e non spoofabile. Ordine in `getClientIp()`:

1. **`CF-Connecting-IP`** — sempre fidato (Cloudflare strippa copie in entrata)
2. **`X-Forwarded-For`** — solo fallback dev/test; **commentare esplicitamente**
   che fuori da Cloudflare non è fidato
3. **`X-Real-IP`** — **droppare completamente** (non-standard, no trust model)

Mai cadere silenziosamente attraverso una chain di header senza documentare
perché ognuno è (o non è) fidato. Rate limit su IP spoofabile = nessun rate limit.

---

## Retry + backoff per operazioni che lasciano orphan state

Operazioni che (a) sono irreversibili su partial success, (b) possono fallire
transient (network blip, external timeout), (c) lasciano lo stato inconsistente
in failure (es. Supabase auth user delete con orphan che blocca re-register)
devono avere:

- 3 retry con exponential backoff (500 ms → 1 s → 2 s)
- `logger.error({ critical: true }, ...)` dopo esaurimento retries
- Comment che documenta il **manual cleanup** richiesto se i retries falliscono

Silent failure qui è peggio di un errore visibile: l'utente resta bloccato
senza signal actionable.

---

## UUID validation: ai boundary delle API, PRIMA del service layer

Ogni route API esterna che accetta un UUID (es. `idempotencyKey`, `receiptId`)
deve validare con `isValidUuid()` e ritornare 400 **prima** di passare a
service/DB. Stringhe non-UUID passate a colonne PostgreSQL UUID producono 500
non gestiti che bypassano tutto l'error handling applicativo.

La validation UUID sta al route handler boundary, non dentro il service.

---

## Hostname validation di link Supabase prima di emailing

Prima di mandare via email qualsiasi link generato da Supabase (password reset,
magic link, email change), assertare che l'URL inizi con `https://${expectedHostname}`.
Una misconfig Supabase (Site URL sbagliato) può produrre link a domini inattesi,
abilitando open redirect.

Se il check fallisce: log error, NON inviare email, redirect utente a
`/verify-email` con messaggio generico.

### URL parsing vs `startsWith`

`link.startsWith("https://mio.dominio.it")` è bypassabile con
`https://mio.dominio.it.attacker.tld/`. Pattern corretto:

```typescript
let parsed: URL | null = null;
try {
  parsed = new URL(link);
} catch {
  /* malformed */
}
if (
  !parsed ||
  parsed.protocol !== "https:" ||
  parsed.hostname !== expectedHostname
) {
  // blocca
}
```

---

## Body size guard PRIMA di `JSON.parse`

Mai chiamare `request.json()` direttamente su una route API che accetta input
arbitrario. Usare un helper `readJsonWithLimit(req, maxBytes)` che legge il body
come `ArrayBuffer`, controlla `byteLength` per primo, poi `JSON.parse`. Return
413 on overflow.

**Limiti consolidati:**

- 32 KB per receipt create (fino a 100 lines)
- 8 KB per single-key bodies (void, checkout)

Previene memory/CPU pressure da payload oversized prima di qualsiasi validation.

---

## Decimal precision: API layer, non solo DB

Le colonne `numeric(10,2)` e `numeric(10,3)` silenziosamente arrotondano/troncano
valori overscale. L'API layer deve rigettare input con troppe decimali (Zod
`.refine`):

```typescript
(v) => parseFloat(v.toFixed(2)) === v; // 2 dp
(v) => parseFloat(v.toFixed(3)) === v; // 3 dp
```

Il roundtrip via stringa gestisce correttamente IEEE-754 noise.

❌ NON usare `Number.isInteger(Math.round(v * 100))` — `Math.round` torna sempre
intero, quindi il check è vacuously true e non rigetta nulla.

---

## Email normalisation: uniforme su TUTTI gli auth flows

`signUp` storicamente normalizzava (`trim().toLowerCase()`) ma `signIn`,
`signInWithMagicLink` e `resetPassword` no, causando fail silenti su
`User@EXAMPLE.COM`. Centralizzare in `normalizeEmail()` in `validation.ts` e
applicare come prima riga di ogni auth action prima della validation.

---

## Wrap external SDK calls (Stripe, AdE, ...) in try-catch — sempre

Errori non catchati da `stripe.customers.create()`, ecc. si propagano come 500
non gestiti senza log context. Pattern corretto:

```typescript
try {
  result = await stripe.someMethod(...);
} catch (err) {
  logger.error({ err, userId }, "Stripe <operation> failed");
  return Response.json(
    { error: "Servizio temporaneamente non disponibile." },
    { status: 503 }
  );
}
```

Usare 503 (non 500) per unavailability transient di servizi esterni.

---

## Lookup `Record` con key user-controlled: Set/type guard, mai `record[input]`

Route dinamiche (`/per/[slug]`, `/help/[slug]`, ...) che fanno lookup su
`Record<Slug, T>` con key da `params`: `record[slug as Slug]` permette ai nomi
del prototype chain (`__proto__`, `constructor`, `toString`, `hasOwnProperty`)
di risolvere come truthy, bypassando `notFound()` e generando 500 server-side
(`category.relatedHelp.map(...)` esplode su un oggetto prototype).

Pattern obbligato:

```typescript
const VALID_SLUGS: ReadonlySet<string> = new Set(slugs);

export function isValidSlug(slug: string): slug is Slug {
  return VALID_SLUGS.has(slug);
}

// route handler
if (!isValidSlug(slug)) notFound();
const item = records[slug]; // type-safe, no prototype risk
```

`Object.hasOwn(record, slug)` è alternativa valida ma meno espressiva.
Aggiungere sempre test mirati per i 4 nomi del prototype chain.

---

## CSP: lezioni dal rollout (completato)

Il rollout è già attivo in `src/lib/security-headers.ts`. Le lezioni residue
da preservare:

- **`Content-Security-Policy` enforce solo in production**, Report-Only in
  dev/test (Next.js dev usa `eval()`, l'enforce senza `'unsafe-eval'` rompe HMR).
  Scelta header in `buildSecurityHeaders` in base a `process.env.NODE_ENV`.
- **`'unsafe-inline'` su `script-src`** OK se mitigato da `safeJsonLd()` in
  `src/components/json-ld.tsx` (escape `<>&`) e payload statici a build time.
  Il valore di sicurezza è nell'**allowlist di origin**, non nel divieto di inline.
- **Anti-pattern:** nonce-based su `script-src` — incompatibile con SSG largo
  marketing (il nonce dev'essere per-request, le pagine SSG sono cached).
- **Security headers in modulo testabile separato** (`src/lib/security-headers.ts`):
  `next.config.ts` non è facilmente unit-testabile, una funzione pura lo è.
- **`Reporting-Endpoints`** indispensabile anche in enforce per detection di
  XSS attempt. Soglia di allarme: >50 violation/giorno o `blockedUri` riconducibile
  a un asset legittimo.

---

## Double-gate rate limit prima di call esterne costose

Endpoint pubblici che chiamano servizi esterni (Turnstile siteverify ~5s
timeout, Resend, AdE) non sono protetti a sufficienza dal solo rate limit
funzionale per-utente: prima di raggiungerlo, un attaccante può aver generato
n×timeout secondi di socket pendenti e n×call HTTP outbound.

Pattern obbligato:

1. **Pre-limit** con bucket dedicato (`captchaPre:<action>:<ip>`, più permissivo
   del limite funzionale — i numeri qui sono **esempi**: le soglie consolidate
   vivono in `src/lib/rate-limit.ts` e nella skill `testing-patterns`) PRIMA
   della call esterna
2. **Limite funzionale post-call** invariato per brute-force applicativo
3. **Log strutturati separati** (`errorClass: "captcha_prelimit"` vs
   `"auth_rate_limit"`)
4. **Bucket keys namespaced** (`captchaPre:<action>:<ip>` vs `<action>:<ip>`)
5. **Test invariant cardinale**: con pre-limit failure, `fetch`/external call
   NON deve essere invocata (`expect(mockFetch).not.toHaveBeenCalled()`).

Applicato a `signUp`/`signIn`/`resetPassword`. Stesso pattern per qualsiasi
endpoint che inneschi invio email, call AdE, generazione PDF, ecc.

---

## `setInterval` in costruttori long-lived: chiamare `.unref?.()`

Classi che istanziano `setInterval` nel costruttore (`RateLimiter`, scheduler,
cache evictor) devono invocare `.unref?.()` sul timer. Senza unref il timer
mantiene il process Node alive — irrilevante per container server (event loop
ha sempre altre referenze), fragile per script one-shot, test runner, setup
jobs che si aspettano exit pulito.

Optional chaining (`?.`) per safety in edge runtime che non espongono l'API.
Test: spy su `setInterval` con `mockReturnValueOnce({ unref })` + verifica
`expect(unref).toHaveBeenCalledTimes(1)` (richiede `vi.useRealTimers()` se il
file usa `vi.useFakeTimers()`).

---

## Redirect param: preservare il querystring

Quando middleware (`proxy.ts`) reindirizza a `/login`, il param `redirect`
deve essere `pathname + search`, NON solo `pathname`. Deep link tipo
`/dashboard/storico?from=2024-01-01&to=2024-01-31` altrimenti perde i filtri
post-login.

Consumer (`(auth)/callback/route.ts`): sanificare come path relativa
(`startsWith("/")` ma NON `startsWith("//")` per bloccare protocol-relative
URLs di open redirect), poi `new URL(redirect, origin)` parsifica il
querystring senza rischi.

---

## Turnstile hostname check: usare una lista, non singolo valore

Cloudflare Turnstile ritorna in `data.hostname` l'hostname dove il widget è
stato risolto. Quando il sito ha sia dominio app (`app.scontrinozero.it`) sia
marketing (`scontrinozero.it`), e il form `/login` può essere caricato da
entrambi (Next.js client-side `<Link>` dalla landing non sempre attraversa il
redirect cross-origin del middleware), il check `===` causa
`captcha_hostname_mismatch` sistemico.

Pattern obbligato in `verifyCaptcha` (`src/server/auth-actions.ts`):

```typescript
const acceptedHostnames: ReadonlySet<string> = new Set([
  appHostname,
  marketingHostname,
  `www.${marketingHostname}`,
]);
if (!acceptedHostnames.has(data.hostname)) { ... }
```

Loggare la lista accettata in caso di mismatch facilita il debug operativo.

Inoltre: il ramo `data.success: false` di Cloudflare deve **sempre** loggare
`data["error-codes"]` (`timeout-or-duplicate`, `invalid-input-response`).
Senza questo log la causa del rifiuto resta invisibile in produzione.

---

## Sentry Logs (pino integration): è una DENYLIST, non un'allowlist

Il drain `pino → Sentry Logs` (`Sentry.pinoIntegration()` + `enableLogs: true`
in `sentry.server.config.ts`) inoltra a Sentry **ogni campo non redatto** del
log. È l'**opposto** del path-eccezioni: `sanitizeForTelemetry` (`src/lib/logger.ts`)
è una **allowlist** (solo `SAFE_KEYS` escono, `ip` raw escluso a favore di
`ipHash`); l'integrazione Logs è una **denylist** (tutto tranne i `REDACT_PATHS`).

Conseguenza pratica: qualsiasi PII loggata anche solo a `info`/`warn` (es. `ip`
raw in `profile-actions.ts` changePassword rate-limit e in `csp-report/route.ts`)
**deve** stare nei `REDACT_PATHS`, altrimenti finisce in chiaro su un terzo
(GDPR). `ip` + `*.ip` sono in `REDACT_PATHS` proprio per questo.

Perché funziona — verificato sul sorgente di `@sentry/node-core` e `pino`:
l'integrazione si sottoscrive al diagnostics channel `pino_asJson` e legge
`JSON.parse(result)`, cioè l'output **post-serializzazione**; la redazione pino
(`fast-redact`) è applicata dentro `_asJson` (i censori `[REDACTED]` sono
stringifier per-path), quindi l'integrazione vede già il dato censurato. Questo
NON vale per l'hook `logMethod` (che gira **prima** della serializzazione e vede
il payload raw — per questo il path-eccezioni usa la allowlist).

`error.levels` dell'integrazione va lasciato vuoto (default): gli errori sono
già catturati come Issue dall'hook `captureToSentry`; abilitarlo creerebbe una
doppia cattura. La regola "ogni nuova PII → `REDACT_PATHS`" è la difesa
centralizzata che protegge anche futuri call site.

Per la **validazione end-to-end del drain** dopo un rollout di telemetria
(sentinella, query Sentry) → skill `sentry-hygiene` e `deploy-release`
(smoke post-deploy).

### `release` per legare un evento al commit in esecuzione

`release: getAppRelease()` (da `@/lib/version`, formato `scontrinozero@<ver>+<sha>`)
in `Sentry.init` tagga **automaticamente sia le Issue sia i Sentry Logs** col
codice in esecuzione — non serve aggiungerlo come attributo. La stessa
`getAppRelease()` alimenta il `base` del logger pino, così anche i `docker logs`
grezzi portano `release` su ogni riga.

Gotcha (estende regola 18, build-vs-runtime): `BUILD_SHA` è **runtime** e
non-`NEXT_PUBLIC`, ed è bakato solo nello stage di produzione del `Dockerfile`
(non nello stage di build). Quindi è leggibile da `sentry.server/edge.config.ts`
e da `logger.ts` (runtime, Node), **ma non** dal bundle client: per taggare con
la release anche gli errori browser servirebbe spostare `BUILD_SHA` allo stage
di build ed esporlo come `NEXT_PUBLIC_*`. Gli errori che identificano "che
codice gira" (AdE, Stripe, DB, webhook) sono comunque tutti server-side.
