---
name: sentry-hygiene
description: Use when triaging or reviewing Sentry issues for the dstmrk/scontrinozero project — periodic review of archived/ignored issues (e.g. SCONTRINOZERO-7 sat at 23 events for 5 weeks before anyone noticed it was UX, not noise), classifying a noisy issue (true bot/scanner noise → beforeSend filter with documented motivation; predictable user input → fix UX via regola 20 logAdeFailure ade_user_error; transient upstream → already covered by isTransientAdeError; client network failures → isClientNetworkFailure in src/lib/sentry-filters.ts), writing or extending the beforeSend filter in sentry.server.config.ts + src/lib/sentry-filters.ts, binding the user to the request scope with Sentry.setUser({ id }) via getAuthenticatedUser (regola 22, Users Impacted), grouping multi-step AdE flows with a flow fingerprint (regola 23, sentryFingerprint via logAdeFailure + Sentry.withScope in src/lib/logger.ts), validating the pino → Sentry Logs drain after a telemetry rollout via /api/_debug/sentry-sentinel (regola 21), running post-deploy smoke (live + env + drain via regole 21+25, procedure in the deploy-release skill), or looking up Sentry events via the Sentry MCP (mcp__Sentry__search_issues, search_events, get_sentry_resource) using the canonical query patterns (errorClass:ade_user_error / ade_transient / ade_failure / sentinel; sentinelId:<id>; flow-derived fingerprint).
---

# sentry-hygiene — Review e classificazione delle issue Sentry

Lezioni operative per non lasciare incancrenire il dataset Sentry: una
issue "archiviata come noise" che in realtà nascondeva UX (SCONTRINOZERO-7)
è peggio di una issue rumorosa che esplode una volta — perché diventa
invisibile.

---

## Quando triggerare il review

- **Prima di ogni release minor (`v1.X.0`)**: pull delle issue archived
  con > N eventi nelle ultime 4 settimane.
- **A ogni rollout di feature di osservabilità** (Sentry Logs, Pino
  integration, metrics): regola 21 di `CLAUDE.md` — sentinella entro
  ~5 min dal deploy.
- **Quando una issue archived sale di scala** (sub-status
  `archived_until_escalating` → `escalating`): ri-aprirla è un segnale
  che la classificazione iniziale era sbagliata.

Comando di pull (Sentry MCP):

```
mcp__Sentry__search_issues({
  organizationSlug: "dstmrk",
  projectSlugOrId: "scontrinozero",
  regionUrl: "https://de.sentry.io",
  query: "is:archived environment:production",
  sort: "freq",
  limit: 30,
})
```

---

## Classificare un'issue archived: tre rami

Ogni issue archived ricade in uno di questi 3 rami. La classificazione
guida l'azione, non viceversa.

### 1. Noise vero (bot/scanner, browser quirk non azionabile)

Esempio canonico: **SCONTRINOZERO-E** `TypeError: Failed to parse body
as FormData` su `POST /_not-found/page` da crawler che provano path
`/RSC/<hash>.txt`.

**Azione**: filtro esplicito in `sentry.server.config.ts:beforeSend`
con il predicato in `src/lib/sentry-filters.ts` e un commento che cita
l'ID issue:

```typescript
beforeSend(event, hint) {
  if (isBenignFormDataParseError(event, hint)) {
    return null; // SCONTRINOZERO-E: bot POST a /_not-found/page
  }
  return event;
}
```

Mai un filtro generico tipo "scarta tutto ciò che non ha stack utile":
ogni filter va con un predicato dedicato + commento che cita l'issue.

### 2. UX nascosto come noise (input utente prevedibile)

Esempio canonico: **SCONTRINOZERO-7** `AdeAuthError` (credenziali
sbagliate dal `/dashboard/settings`), 23 eventi in 5 settimane prima
dell'archiviazione.

**Sintomi**:

- Conteggio cumulativo alto, ma `Users Impacted` distribuito (non un
  utente che cicla).
- Il messaggio descrive una condizione che **l'utente può correggere**
  (credenziali, P.IVA già usata, token captcha scaduto, payment
  declined).
- Lo stack passa da una server action — non da un job batch o un cron.

**Azione**: regola 20 di `CLAUDE.md`. Spostare il throw in un return
`{ error: "..." }` e cambiare il log level a warn con `errorClass:
"ade_user_error"` (o equivalente). Pattern canonico:

```typescript
// src/lib/ade/log-failure.ts
if (isExpectedUserAdeError(err)) {
  logger.warn(
    { err, ...context, errorClass: "ade_user_error" },
    messages.failure,
  );
  return;
}
```

`isExpectedUserAdeError` copre `AdeAuthError` + `AdePasswordExpiredError`.
Estensione naturale: copia il pattern per Stripe (card declined),
Resend (bounced email) appena emerge il caso.

Il `logger.error` (level ≥ 50) → `Sentry.captureException` va riservato a
condizioni inattese (DB down, SDK che fallisce in modo non documentato):
un errore d'input utente in Sentry è noise esattamente come "password
sbagliata su `/login`".

**Lato client** lo stesso principio si applica tramite `beforeSend` in
`sentry.client.config.ts`: i fallimenti di rete browser (`TypeError: Load
failed` su iOS, `Failed to fetch` su Chrome) generati da `fetchServerAction`
sono sempre transitori (connessione mobile caduta) — filtrati da
`isClientNetworkFailure()` in `src/lib/sentry-filters.ts` (SCONTRINOZERO-J).

### 3. Transient upstream (rete, 5xx esterno, SPID timeout)

Esempio: AdE in downtime, Stripe webhook intermittente.

**Azione**: già coperto da `isTransientAdeError` (ramo
`ade_transient` di `logAdeFailure`). Per altri SDK estendere lo stesso
pattern: predicato → `logger.warn` con `errorClass: "<sdk>_transient"`,
mai `logger.error`.

---

## `Sentry.setUser({ id })` su ogni richiesta autenticata (regola 22)

Tutte le server action e i route handler che chiamano
`getAuthenticatedUser()` bindano automaticamente l'auth user UUID allo scope
Sentry della richiesta: il bind è già **dentro** `getAuthenticatedUser` in
`src/lib/server-auth.ts` — non va rifatto a mano, va solo non aggirato.

Senza questo `Users Impacted` resta a 0 su ogni issue: tutte e 10 le issue
Sentry analizzate (SCONTRINOZERO-7 a -H) avevano `Users: 0` anche quando il
bug toccava più utenti in 2 minuti — il triage non poteva prioritizzare per
impatto.

Passare **solo `id`** (UUID opaco di Supabase Auth): niente
`email`/`username`/`ip`, coerente con il denylist `SAFE_KEYS` di
`src/lib/logger.ts` e con la policy GDPR. Per le route che usano auth diversa
(es. Bearer API key in `/api/v1/*`) il fix è analogo ma puntuale a ciascun
handler — **non** propagare l'`apiKeyId` come `user.id`.

---

## Fingerprint per flow multi-step (regola 23)

I flow AdE (login → wizard → submit) generano errori in step diversi: Sentry
li raggruppa per `message + stack`, quindi `wizardTemplate failed 500` e
`setUserChoice failed 500` finiscono in 2 issue distinte anche se parte della
stessa onboarding fallita (SCONTRINOZERO-9 + -A, trace_id 5efe8519…).

Per evitarlo, **passa `flow: "<nome-flow>"` nel context di `logAdeFailure()`**
(`src/lib/ade/log-failure.ts`): sul ramo `ade_failure` viene iniettato
`sentryFingerprint: [flow, "ade_failure"]` nel payload pino, e
`captureToSentry` in `src/lib/logger.ts` lo applica via
`Sentry.withScope(s => s.setFingerprint(...))`. I rami warn
(transient/user_error) ignorano `flow`: non salgono a Sentry.

Flow già instrumentati: `onboarding-verify` (verifyAdeCredentials),
`emit-receipt` (receipt-service), `void-receipt` (void-service). Per nuovi
flow scegli uno **slug stabile** (no spazi, no version): cambia il
fingerprint = perdi la continuità storica del group.

---

## Lookup puntuale via Sentry MCP

Tre query canoniche, già supportate dai tag che il repo emette:

**Sentry Logs (dataset `logs`)** — degrado userside o transient:

```
errorClass:ade_user_error environment:production
errorClass:ade_transient environment:production
errorClass:sentinel sentinelId:<id>   # validazione drain (R21)
```

**Sentry Issues (default `errors`)** — eventi che hanno superato il
`level≥50` hook:

```
errorClass:ade_failure environment:production
errorClass:ade_failure flow:onboarding-verify  # group per flow (R23)
```

Per validare un singolo trace user-session:

```
mcp__Sentry__search_events({
  organizationSlug: "dstmrk",
  dataset: "spans",
  query: "trace:<trace_id>",
  ...
})
```

Storico: SCONTRINOZERO-9, -A, -B condividevano `trace_id 5efe8519…`,
3 issue distinte per un'unica onboarding fallita. Con la regola 23 i
sub-step finiscono nello stesso group.

---

## Smoke post-deploy → skill `deploy-release`

La procedura canonica dei tre probe (live + env + drain, regole 21+25) vive
nella skill `deploy-release`. Lato Sentry, la validazione del drain è:
cerca `errorClass:sentinel sentinelId:v$VERSION` (dataset `logs` **e**
pannello issues) entro ~5 min dal deploy; se la sentinella non appare →
integrazione rotta, rollback o riapri la PR.

---

## Pattern repo: ogni guard cita l'ID issue

Quando aggiungi un filtro `beforeSend`, un `logAdeFailure`, un
`safeSessionStorage`, o un `getTrustedAppUrl`, **commenta esplicito**
l'ID Sentry che ha originato il fix. Esempi già in repo:

- `src/lib/safe-storage.ts` → cita `SCONTRINOZERO-H`
- `src/lib/trusted-app-url.ts` → cita `SCONTRINOZERO-F` + regola 18
- `sentry.server.config.ts:beforeSend` + `src/lib/sentry-filters.ts` →
  cita `SCONTRINOZERO-E`
- `src/lib/ade/log-failure.ts` → cita `SCONTRINOZERO-7` (regola 20)
- `src/instrumentation.ts` → cita `SCONTRINOZERO-F` + regola 24

Rende la lezione trovabile in `grep -rn "SCONTRINOZERO-<id>"` e
preserva il filo storico anche dopo che l'issue è archived in Sentry.

---

## Anti-pattern: archiviare senza classificare

`Archive until escalating` è un'opzione potente ma silenziosa: l'issue
ricompare solo se il volume cresce. Se è "noise" deve diventare un
filter (ramo 1 sopra); se è "UX" deve diventare un fix (ramo 2). Lasciarla
archived senza azione = nascondere il debito.

Storico (lezione che ha portato a questa skill): SCONTRINOZERO-7 è
rimasta archived per 5 settimane e 23 eventi prima di essere
ri-classificata come UX. Il review periodico (sezione 1 sopra) esiste
proprio per intercettare questa categoria.
