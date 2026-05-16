# REVIEW — Audit approfondito codice (sicurezza, performance, funzionalità, architettura)

Data audit: 2026-05-16

## Metodo usato

1. Lettura completa di `PLAN.md` per escludere miglioramenti già pianificati.
2. Passata #1 su aree critiche: auth, middleware/proxy, API pubbliche, servizi DB, integrazioni esterne (Stripe/Supabase/Resend), utility condivise.
3. Passata #2 su regressioni/edge-case e coerenza cross-file.
4. Passata #3 finale di conferma: nessun nuovo finding rispetto alla #2 ⇒ stop.

> Nota: come richiesto, il rate limiter in-memory **non** è considerato un problema dato il singolo container in produzione.

---

## Findings ordinati per priorità

## P1 — Alta priorità

### 1) `readJsonWithLimit` / `readTextWithLimit`: possibile memory spike con chunking ostile (DoS applicativo)

**Categoria:** Sicurezza + Performance

**Problema**
`readBodyWithLimit()` accumula tutti i chunk in `chunks[]` e poi crea un buffer unico `combined` con seconda copia dei byte. Anche con `maxBytes` basso, un attaccante può inviare molte richieste concorrenti vicino al limite (es. 8–32 KB), causando overhead GC/memoria (double-buffering + array chunks) e jitter di latenza.

**Impatto reale**

- endpoint pubblici col guard body-size restano protetti dal payload gigante, ma in burst alto il pattern attuale aumenta la pressione memoria.
- rischio: p95/p99 degradati e restart OOM su container piccolo.

**Fix richiesto (senza ambiguità)**

- riscrivere `readBodyWithLimit()` in modalità pre-allocata o single-pass senza doppia copia:
  - se `Content-Length` valido e <= `maxBytes`: pre-allocare `Uint8Array(declared)` e riempire progressivamente.
  - altrimenti usare `ReadableStream` ma con append su buffer incrementale unico (no array di chunks + merge finale).
- introdurre test di regressione con `ReadableStream` spezzato in molti chunk per verificare:
  - reject a `> maxBytes` senza accumulare oltre soglia,
  - comportamento corretto per JSON/text validi.
- opzionale hardening: limite massimo di chunk count per request per mitigare pathological chunking.

**File principali coinvolti**

- `src/lib/request-utils.ts`
- endpoint che usano helper (`src/app/api/csp-report/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/stripe/checkout/route.ts`, ecc.)

---

### 2) Proxy hostname allowlist: dipendenza da variabili `NEXT_PUBLIC_*` non normalizzate/validate

**Categoria:** Sicurezza + Affidabilità operativa

**Problema**
In `hostnameRedirect()` gli hostname trusted arrivano da env (`NEXT_PUBLIC_APP_HOSTNAME`, `NEXT_PUBLIC_MARKETING_HOSTNAME`, `NEXT_PUBLIC_API_HOSTNAME`) senza validazione formale (charset, spazi, protocol leak, trailing dot). Un valore malformato può alterare comportamento redirect/canonicalization in modo silenzioso.

**Impatto reale**

- rischio di redirect policy inconsistente (loop, mancata separazione domini, SEO canonical errato).
- in scenari self-hosted / deploy manuali, errore di configurazione più probabile.

**Fix richiesto**

- creare helper condiviso `parseTrustedHostnameEnv(name, fallback)` che:
  - trim,
  - lower-case,
  - rifiuta stringhe vuote,
  - rifiuta presenza di schema (`http://`, `https://`), slash, query, spazi,
  - normalizza eventuale trailing dot.
- se invalido:
  - in production: fail-closed (ritorno 500 controlled oppure fallback sicuro + log `critical:true`),
  - in dev/test: warning esplicito.
- aggiungere test unit su input invalidi (es. `"https://evil.com"`, `"app.com/path"`, `" app.com "`, `""`).

**File principali**

- `src/proxy.ts`
- test proxy associati

---

## P2 — Media priorità

### 3) `sendEmail()` senza timeout/circuit-breaker/retry policy esplicita

**Categoria:** Affidabilità + Performance (tail latency)

**Problema**
`sendEmail()` invoca Resend direttamente e rilancia errore, ma senza timeout applicativo esplicito né policy retry controllata. In caso di degradazione provider (latenza alta ma non errore immediato), le action che inviano email possono rimanere bloccate troppo a lungo.

**Impatto reale**

- peggior UX su signup/reset/delete flow;
- rischio saturazione worker/thread in presenza di ritardi esterni.

**Fix richiesto**

- introdurre wrapper `withTimeout` (es. 5s) + classificazione errori transient/permanent.
- retry limitato (es. 1 retry con jitter) solo per errori transient (5xx/network timeout).
- logging strutturato con `errorClass` coerente.
- mantenere semantica business attuale: dove email è best-effort non bloccare transazione principale; dove è requisito forte, errore esplicito ma rapido.

**File principali**

- `src/lib/email.ts`
- chiamanti in `src/server/*actions.ts`

---

### 4) `createBrowserSupabaseClient()` usa fallback `""` su env mancanti (errore runtime opaco)

**Categoria:** Funzionalità + DX/Operabilità

**Problema**
Nel client browser, URL e key Supabase usano `?? ""`. In misconfigurazione l’app costruisce comunque il client e fallisce più tardi con errori poco diagnostici.

**Impatto reale**

- debugging lento in ambienti preview/self-hosted;
- rischio di bug “silenziosi” lato client.

**Fix richiesto**

- introdurre validazione eager anche client-side:
  - se env mancanti: throw con messaggio chiaro e azionabile (nome variabile + remediation).
- opzionale: feature flag per fallback solo in test.
- aggiungere test unitari dedicati.

**File principali**

- `src/lib/supabase/client.ts`
- `src/lib/supabase/client.test.ts`

---

## P3 — Bassa priorità

### 5) Duplicazione di policy timeout/retry sparse in più moduli (rischio drift)

**Categoria:** Architettura + Manutenibilità

**Problema**
Esistono pattern retry/timeout in più punti (`auth-actions`, servizi AdE, email, ecc.) con logiche simili ma non centralizzate. Questo aumenta il rischio di divergenze (backoff diversi, logging incoerente, error mapping non uniforme).

**Impatto reale**

- costo manutentivo crescente;
- hardening non omogeneo nel tempo.

**Fix richiesto**

- introdurre utility condivise:
  - `retryTransient({attempts, baseDelayMs, jitter, classifyError})`
  - `withExternalTimeout(ms, fn)`
- migrare progressivamente i call-site più critici.
- definire convenzione comune di log fields (`errorClass`, `provider`, `operation`, `retryAttempt`).

**File principali (candidati iniziali)**

- `src/server/auth-actions.ts`
- `src/lib/ade/real-client.ts`
- `src/lib/email.ts`
- `src/lib/db-timeout.ts` (allineamento naming/convenzioni)

---

## Verifica contro PLAN.md (de-dup)

Gli item sopra **non** duplicano i backlog già presenti nel piano (es. B6/B9/B14b/B16/B17/B18/B21 ecc.). In particolare:

- non include il monthly limit Developer API (già B6),
- non include stuck claim Stripe (già B9),
- non include pagination catalogo (già B16),
- non include DB CHECK constraints/index backlog (già B17/B18),
- non include CSP `'unsafe-inline'` cleanup (già B14b).

---

## Esito passate iterative

- **Passata #1:** trovati 5 finding.
- **Passata #2:** nessun finding nuovo; raffinata solo la descrizione dei fix.
- **Passata #3 (X+1):** nessun finding nuovo rispetto a #2.

Criterio di stop raggiunto: alla passata X+1 non emergono issue aggiuntive.
