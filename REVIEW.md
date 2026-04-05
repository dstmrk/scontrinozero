# REVIEW — Code Audit (sicurezza, performance, funzionalità, architettura)

## Metodo usato

Ho eseguito una code review multi-pass come richiesto, con priorità su:

1. **sicurezza e privacy**,
2. **consistenza dati / failure modes**,
3. **affidabilità runtime e performance**,
4. **qualità architetturale e manutenibilità**.

In ogni passata ho verificato che i finding non fossero già pianificati in `PLAN.md` (backlog B1–B7).

---

## Verifica rispetto a PLAN.md

Sono stati **esclusi** volutamente dalla review (perché già presenti nel piano):

- dedup webhook Stripe su `event.id` (B1),
- paginazione/export a volume alto (B2),
- key rotation zero-downtime (B3),
- error envelope uniforme API (B4),
- TTL/revoca link pubblici ricevute (B5),
- enforcement limiti mensili Developer API (B6),
- recovery stati `PENDING` stale in emissione (B7).

---

## Passata 1 — finding principali

### [P1] Possibile leakage di dati sensibili verso Sentry (redaction bypass)

**Area:** Sicurezza / Privacy / Compliance  
**File:** `src/lib/logger.ts`

#### Problema

La redazione di Pino è configurata, ma l’hook `logMethod` inoltra a Sentry `inputArgs[0]` **prima** che sia garantita la redazione del payload. Questo può inviare in Sentry campi sensibili presenti nel contesto log (o annidati dentro `err`), anche se su output log risultano redatti.

#### Impatto

- rischio di esposizione PII/segreti su terza parte (Sentry),
- possibile non conformità GDPR/security policy,
- superficie di data breach aumentata in caso di incident response o accessi impropri al tenant osservabilità.

#### Fix consigliato (non ambiguo)

1. Introdurre una funzione di sanitizzazione esplicita (`sanitizeForTelemetry`) che applica redaction severa prima di `captureException/captureMessage`.
2. Inviare a Sentry **solo allowlist** di campi contestuali (es. `requestId`, `path`, `method`, `userId`, `eventType`) e mai payload raw.
3. Aggiungere test unit che validino che campi come `password`, `token`, `actionLink`, `authorization`, `cookie`, `codiceFiscale` non arrivino a Sentry.
4. Opzionale ma raccomandato: aggiungere ulteriore filtro in `beforeSend` lato SDK Sentry.

---

### [P1] Failure mode critico in cancellazione account: utente auth orfano

**Area:** Funzionalità / Data consistency / Operatività  
**File:** `src/server/account-actions.ts`

#### Problema

`deleteAccount()` elimina prima il profilo locale (con cascata dati), poi tenta la cancellazione utente in Supabase Auth con retry. Se la cancellazione Auth fallisce, rimane un utente Auth senza profilo applicativo (stato esplicitamente ammesso dal codice come “manual cleanup required”).

#### Impatto

- stato inconsistente cross-system,
- rischio lockout/re-registrazione bloccata o comportamento anomalo,
- forte dipendenza da intervento manuale in produzione.

#### Fix consigliato (non ambiguo)

1. Rendere il flusso **saga-style** con stato esplicito (`deletion_pending`, `deletion_failed`, `deleted`) su tabella profili o tabella dedicata.
2. Invertire la sequenza: richiedere delete Auth e completare delete locale solo dopo successo, **oppure** mantenere hard-delete locale ma con job di compensazione persistente (outbox/retry queue).
3. Se delete Auth fallisce definitivamente, segnare stato recuperabile e impedire silent success verso UI.
4. Esporre metriche/alert su backlog cancellazioni fallite.

---

### [P1] Degrado globale del rate-limit in produzione se manca header Cloudflare

**Area:** Sicurezza / Availability  
**File:** `src/lib/get-client-ip.ts`, route che usano limiter per IP (es. PDF pubblico)

#### Problema

In produzione, in assenza di `CF-Connecting-IP`, la funzione ritorna stringa fissa `"unknown"`. Tutte le richieste finiscono nello stesso bucket del rate limiter.

#### Impatto

- perdita totale della granularità per-client,
- rischio di blocco globale involontario (un client può saturare il bucket condiviso),
- mitigazione anti-abuso fortemente indebolita durante misconfigurazioni edge/proxy.

#### Fix consigliato (non ambiguo)

1. In produzione, se `CF-Connecting-IP` manca, rispondere con errore esplicito (`503` o `500` con codice macchina) sulle route protette da IP-based limiter, invece di usare `unknown`.
2. Aggiungere healthcheck/config-check in startup che fallisca fast se deployment richiede Cloudflare ma header trusted non è disponibile.
3. Aggiungere metrica contatore `missing_cf_connecting_ip` con alert immediato.

---

### [P2] Messaggi errore AdE propagati quasi raw ai client

**Area:** Sicurezza / UX / Robustezza API  
**File:** `src/lib/services/receipt-service.ts`, `src/lib/services/void-service.ts`

#### Problema

Quando AdE rifiuta (`esito:false`), il codice concatena e ritorna descrizioni errore AdE direttamente verso client (`Scontrino rifiutato...: ${errorDesc}`). Le descrizioni possono includere dettagli di dominio fiscale non pensati per esposizione diretta.

#### Impatto

- possibile disclosure di dettagli interni/fiscali,
- coupling forte client↔messaggistica provider esterno,
- instabilità UX/API se AdE cambia testi o formato.

#### Fix consigliato (non ambiguo)

1. Restituire ai client solo errori applicativi normalizzati (es. `ADE_REJECTED_VALIDATION`, `ADE_REJECTED_AUTH`, `ADE_REJECTED_GENERIC`) con messaggi utente controllati.
2. Conservare il dettaglio AdE completo solo nei log sicuri/DB (redatti).
3. Mappare `errori[].codice` a catalogo interno versionato; fallback a codice generico.
4. Aggiornare test API per verificare che descrizioni AdE raw non escano in risposta.

---

### [P2] `verifyCaptcha` troppo rigido su hostname: rischio blocco signup in ambienti legittimi

**Area:** Funzionalità / Deployability  
**File:** `src/server/auth-actions.ts`

#### Problema

La verifica CAPTCHA richiede `data.hostname === NEXT_PUBLIC_APP_HOSTNAME` esatto. In scenari reali (staging, domini multipli, alias temporanei, www/non-www) la validazione può fallire anche con token valido.

#### Impatto

- signup bloccato in deploy non perfettamente allineati,
- fragilità operativa durante rollout/migrazioni DNS,
- falsi negativi difficili da diagnosticare lato utente.

#### Fix consigliato (non ambiguo)

1. Supportare allowlist hostnames (`TURNSTILE_ALLOWED_HOSTNAMES=host1,host2,...`).
2. Normalizzare hostname (lowercase, trim, eventuale gestione trailing dot).
3. Loggare mismatch in forma strutturata (hostname ricevuto vs expected-set) senza dati sensibili.
4. Testare scenari multi-host in unit test.

---

## Passata 2 — nuovi finding aggiuntivi (non duplicati)

### [P3] Istanza Stripe creata ad ogni chiamata (`new Stripe(...)`) invece di singleton

**Area:** Performance / Efficienza runtime  
**File:** `src/lib/stripe.ts`

#### Problema

`getStripe()` costruisce una nuova istanza client ad ogni invocazione.

#### Impatto

- overhead evitabile su chiamate frequenti,
- maggiore churn oggetti e minore efficienza in hot path (webhook/checkout/portal).

#### Fix consigliato (non ambiguo)

1. Introdurre cache modulo-level (`let cachedStripe: Stripe | null`) e riuso singleton.
2. Mantenere validazione env al primo accesso.
3. Aggiungere test per garantire idempotenza di `getStripe()`.

---

## Passata 3 — verifica convergenza

Nella passata 3 **non sono emerse nuove issue** rispetto alla passata 2.

Criterio di stop raggiunto: passata X+1 senza nuovi finding.

---

## Prioritizzazione finale (ordinata)

1. **P1** — Leakage potenziale dati sensibili verso Sentry (`src/lib/logger.ts`)
2. **P1** — Inconsistenza critica in `deleteAccount` con utente auth orfano (`src/server/account-actions.ts`)
3. **P1** — Bucket rate-limit globale su `unknown` in prod (`src/lib/get-client-ip.ts`)
4. **P2** — Propagazione messaggi AdE raw ai client (`src/lib/services/receipt-service.ts`, `src/lib/services/void-service.ts`)
5. **P2** — CAPTCHA hostname check troppo rigido (`src/server/auth-actions.ts`)
6. **P3** — Client Stripe non riusato (singleton mancante) (`src/lib/stripe.ts`)
