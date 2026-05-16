# REVIEW — Audit codice (sicurezza, performance, funzionalità, architettura)

## Verifica anti-duplicazione con PLAN.md

Ho confrontato ogni finding con `PLAN.md` e **non ho incluso** issue già tracciate (es. limiti monthly API, catalog pagination, key rotation zero-downtime, Stripe stuck-claim, CSP hardening già pianificati).

---

## Passata 1

### P1 — Privacy/Security: possibile leak di IP raw verso Sentry

**Priorità:** P1  
**Area:** Sicurezza / Compliance privacy  
**Impatto:** Dati personali (IP) possono finire su piattaforma terza (Sentry) senza minimizzazione sistematica.

**Evidenza tecnica**

- `sanitizeForTelemetry()` include la chiave `ip` tra i campi inoltrabili a Sentry.
- Il logger invia automaticamente eventi `error/fatal` a Sentry via `captureToSentry()`.
- Alcuni punti codice loggano `ip` raw (non hash), quindi in caso di error-level logging questi dati possono transitare su telemetry esterna.

**Perché è un problema**

- L’IP è dato personale in UE/Italia.
- Aumenta superficie GDPR/compliance e rischio in caso di data sharing non atteso.

**Fix suggerito (non ambiguo, pronto per AI agent)**

1. In `src/lib/logger.ts`, rimuovere `ip` da `SAFE_KEYS` e mantenere solo `ipHash`.
2. Aggiungere test unitario che verifica che `sanitizeForTelemetry({ ip: '1.2.3.4', ipHash: '...' })` **non** includa `ip` ma includa `ipHash`.
3. Cercare nei callsite log dove oggi si passa solo `ip` e affiancare `ipHash` dove utile per correlazione.
4. Aggiornare `DEVELOPER.md`/documentazione logging per standardizzare: “mai IP raw su log error -> telemetry”.

**Criteri di accettazione**

- Nessun payload inviato a Sentry contiene più la chiave `ip`.
- Test logger verdi.

---

### P2 — Resilienza/Performance: auth API key senza statement timeout DB dedicato

**Priorità:** P2  
**Area:** Performance / Availability  
**Impatto:** In caso di saturazione DB, ogni chiamata `/api/v1/*` resta bloccata in autenticazione (prima della business logic), peggiorando tail latency e timeout lato client.

**Evidenza tecnica**

- `authenticateApiKey()` esegue query DB + update fire-and-forget senza `withStatementTimeout()` locale.
- Le route v1 hanno timeout su alcune query applicative, ma l’hot path auth può comunque restare bloccante.

**Perché è un problema**

- Auth è nel critical path di **tutte** le API v1.
- Un collo di bottiglia in auth annulla i benefici dei timeout sulle query successive.

**Fix suggerito**

1. Wrappare la `select ... from api_keys join profiles ...` con `withStatementTimeout()` (es. 1500–2500 ms).
2. Se timeout, ritornare errore transiente coerente (503 con code machine-readable, es. `DB_TIMEOUT`) nel layer helper API.
3. Valutare timeout anche sull’`update last_used_at` (best effort: in caso timeout deve solo loggare warning, senza impattare auth success).
4. Aggiungere test unit per branch timeout auth.

**Criteri di accettazione**

- In condizioni DB lenti, `/api/v1/*` risponde rapidamente con 503 retryable anziché pendere.
- Nessun regressione sui test auth API key.

---

### P2 — Robustezza webhook Stripe: assenza di timeout esplicito su chiamate outbound Stripe durante handle

**Priorità:** P2  
**Area:** Affidabilità / Operatività  
**Impatto:** Eventi webhook possono occupare worker a lungo se chiamate Stripe downstream degradano; aumenta rischio backlog, ritardi e retry storms.

**Evidenza tecnica**

- Nel flow webhook, `handleEvent()` invoca operazioni Stripe (es. `stripe.subscriptions.retrieve`) senza timeout/circuit-break locale esplicito.
- In caso di lentezza esterna, la request webhook può durare troppo e scadere lato infrastruttura.

**Perché è un problema**

- Gli endpoint webhook devono essere veloci/robusti (ack tempestivo o fallimento controllato).
- Latency esterna prolungata può amplificare retry concorrenti di Stripe.

**Fix suggerito**

1. Definire timeout applicativo per chiamate Stripe nel webhook path (via opzioni SDK o wrapper con abort/race timeout).
2. Distinguere errori transienti (retry) vs permanenti nei log con `errorClass` dedicata.
3. Aggiungere metrica/log structured su durata webhook totale e durata chiamate Stripe.
4. Test unit: simulare latenza/failure e verificare comportamento (500 retryable + claim release).

**Criteri di accettazione**

- Nessuna chiamata Stripe nel webhook supera il budget configurato.
- In timeout esterno, claim viene rilasciato e Stripe può ritentare.

---

## Passata 2

Rilettura focalizzata su route API, servizi AdE, helper request/body, logging, webhook Stripe.

**Nuove issue rispetto alla passata 1:** nessuna.

---

## Esito stop condition

Eseguita passata X+1 senza finding aggiuntivi rispetto alla X precedente: **analisi conclusa**.
