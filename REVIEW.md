# REVIEW — Codebase audit (sicurezza, performance, funzionalità, architettura)

Data analisi: 2026-04-14.

## Verifica anti-duplicazione con `PLAN.md`

Prima di produrre i findings ho verificato il backlog in `PLAN.md` per evitare duplicati.
Ho **escluso volontariamente** questi temi già pianificati:

- B1 dedup Stripe su `event.id`
- B2 paginazione/export grandi volumi
- B3 key rotation zero-downtime
- B4 error envelope uniforme API
- B5 TTL/revoca link pubblici
- B6 limiti mensili Developer API
- B7 recovery stati PENDING stale
- B8 allowlist hostname CAPTCHA

I findings sotto sono quindi **nuovi rispetto al piano corrente**.

---

## Metodo (passate iterative)

### Passata 1 — superfici critiche (auth, billing, receipt emission/void, API)

Focus su:

- `src/app/api/stripe/*`
- `src/lib/services/*`
- `src/server/*actions.ts`
- `src/app/api/v1/receipts/*`

Nuovi finding trovati: **4**.

### Passata 2 — coerenza cross-modulo, date/time, failure semantics

Focus su:

- parsing date e range filters
- consistenza webhook ↔ profili/piani
- validazione runtime server actions

Nuovi finding trovati: **2**.

### Passata 3 — riesame completo dei finding + ricerca regressioni/overlap

Riletti i moduli e verificata non sovrapposizione con `PLAN.md`.

Nuovi finding trovati: **0**.

**Condizione di arresto raggiunta**: passata X+1 senza nuove issue rispetto a X.

---

## Findings prioritizzati

## P0-01 — Stripe webhook: dedup registrato prima del processing ⇒ perdita definitiva eventi su errore transiente

**Priorità:** P0 (critico)

### Dove

- `src/app/api/stripe/webhook/route.ts`
- `src/db/schema/stripe-webhook-events.ts`

### Problema

L’evento viene inserito in `stripe_webhook_events` **prima** di `handleEvent(...)`. Se `handleEvent` fallisce (timeout DB, lock, errore rete Stripe, eccezione runtime), la route risponde 500, ma l’ID evento resta già deduplicato. Al retry successivo Stripe invia lo stesso `event.id`, ma l’app lo scarta come “duplicate already processed”.

Risultato: at-most-once “finto” che in pratica diventa **drop permanente** di eventi non processati.

### Impatto

- desincronizzazione billing/profile (`plan`, `status`, `period_end`)
- utente pagante non abilitato o downgrade errati
- riconciliazione manuale costosa

### Fix raccomandato (non ambiguo)

1. Trasformare la tabella eventi in statoful processing:
   - campi minimi: `status` (`processing|processed|failed`), `processed_at`, `last_error`, `attempt_count`.
2. Sequenza robusta:
   - `INSERT ... ON CONFLICT DO NOTHING` con `status='processing'`.
   - processare evento.
   - solo a successo, update `status='processed'`.
3. Se processing fallisce:
   - update `status='failed'` + `last_error`.
   - restituire 500 **senza bloccare retry utile**.
4. Dedup logic: trattare come duplicate solo `status='processed'`.
5. Aggiungere job di recovery/replay per `failed` (o reprocess on next delivery).

### Criteri di accettazione

- Un errore simulato in `handleEvent` non deve rendere l’evento irripetibile.
- Retry dello stesso `event.id` dopo failure deve processare correttamente.
- Duplicate truly-processed deve restare idempotente.

---

## P0-02 — Mancanza di enforcement piano/trial su emissione/annullo scontrini (server-side)

**Priorità:** P0 (revenue + policy enforcement)

### Dove

- `src/server/receipt-actions.ts`
- `src/server/void-actions.ts`
- `src/lib/plans.ts` (`canEmit` esiste ma non è applicato nei flussi critici)
- `src/lib/services/receipt-service.ts`
- `src/lib/services/void-service.ts`

### Problema

I flussi server-side che emettono/annullano non verificano `canEmit(plan, trialStartedAt)`.
La funzione di policy esiste ma non viene usata nei path operativi. Un trial scaduto può quindi continuare a emettere se arriva alla server action.

### Impatto

- bypass regole commerciali/contrattuali
- consumo risorse AdE e infrastruttura fuori policy
- rischio inconsistenza tra UI (messaggi trial scaduto) e backend effettivo

### Fix raccomandato

1. Introdurre guard server-side unica (es. helper `enforceEmitPermission(userId)`).
2. Applicarla prima di:
   - `emitReceipt(...)`
   - `voidReceipt(...)`
   - endpoint API equivalenti se il prodotto prevede stesse policy.
3. Risposta machine-readable (`code`) per UI/API (es. `TRIAL_EXPIRED`, `PLAN_FORBIDDEN`).
4. Test TDD:
   - trial attivo: ok
   - trial scaduto: blocked
   - pro/unlimited: ok

### Criteri di accettazione

- Nessun path server-side consente emissione/annullo con trial scaduto.
- Test end-to-end copre almeno UI server action + API route rilevanti.

---

## P1-03 — Server actions cassa senza validazione runtime robusta (trust eccessivo nel client)

**Priorità:** P1

### Dove

- `src/server/receipt-actions.ts` (solo check minimali)
- `src/types/cassa.ts` (tipi TS non proteggono a runtime)
- confronto con validazione forte già presente in `src/app/api/v1/receipts/route.ts`

### Problema

`emitReceipt` lato server action accetta `SubmitReceiptInput` senza schema runtime equivalente a quello API v1. I controlli attuali sono minimi (`businessId`, `lines.length`). Un client manipolato può inviare payload numericamente/semanticamente invalidi (quantità/prezzi fuori range, precisione errata, campi inattesi).

### Impatto

- errori AdE evitabili
- maggiore carico su DB/servizi esterni
- comportamento divergente tra canale UI e canale API

### Fix raccomandato

1. Estrarre schema Zod condiviso (es. `receiptInputSchema`) usato da:
   - API v1
   - server action `emitReceipt`
2. Validare anche `idempotencyKey`, `lotteryCode`, precisione decimali, limiti linee.
3. Restituire errore coerente e non ambiguo.
4. Test mirati su payload malformed via server action.

### Criteri di accettazione

- Le stesse regole di validazione sono applicate in modo uniforme su tutti i canali d’ingresso.
- Payload non conformi vengono rifiutati prima della business logic.

---

## P1-04 — Parsing date fragile in API receipt list: input formalmente valido ma data invalida non gestita

**Priorità:** P1

### Dove

- `src/app/api/v1/receipts/route.ts`

### Problema

Il check usa regex `YYYY-MM-DD`, poi costruisce `new Date(...)` ma non verifica `Number.isNaN(date.getTime())`.
Date impossibili (es. mese/giorno fuori range) passano il formato regex, producendo `Invalid Date` e potenziali errori runtime/query.

### Impatto

- 500 evitabili su input client errato
- superficie di errore non deterministica lato API consumer

### Fix raccomandato

1. Aggiungere validazione hard su `fromDate` e `toDate` (`getTime()` non NaN).
2. Restituire 400 con messaggio preciso.
3. Test: date invalide (es. `2026-13-01`, `2026-02-30`) ⇒ 400.

### Criteri di accettazione

- Nessun `Invalid Date` raggiunge i layer DB.
- Error handling deterministico e testato.

---

## P1-05 — Inconsistenza timezone nei filtri data tra API e storico server action

**Priorità:** P1

### Dove

- `src/app/api/v1/receipts/route.ts` (UTC esplicito)
- `src/server/storico-actions.ts` (`new Date(...)` + `setDate` locale)

### Problema

I due percorsi usano semantiche diverse:

- API v1: normalizzazione UTC esplicita.
- Storico server action: parse locale + `setDate` locale.

Questo può generare off-by-one day in prossimità di timezone/DST, con risultati diversi a parità di range richiesto.

### Impatto

- dati incoerenti tra schermata storico e API
- bug intermittenti difficili da riprodurre (dipendenti da timezone host)

### Fix raccomandato

1. Uniformare tutti i filtri date a UTC day-boundary (`T00:00:00.000Z` / end-exclusive +1 day UTC).
2. Incapsulare la logica in helper condiviso (single source of truth).
3. Test parametrizzati su edge DST/timezone.

### Criteri di accettazione

- Stesso intervallo logico produce stesso dataset su API e server action.
- Nessun drift su boundary di giornata.

---

## P1-06 — Webhook Stripe: ack “success” anche con aggiornamenti DB nulli (desync silenzioso)

**Priorità:** P1

### Dove

- `src/app/api/stripe/webhook/route.ts` (`syncSubscriptionData`, handler vari)

### Problema

In più branch il codice non verifica in modo stringente l’effettivo numero di righe aggiornate. Alcuni casi loggano errore ma non falliscono hard; la route può comunque rispondere `{received:true}`. Con dedup attivo, si rischia desincronizzazione silenziosa non recuperabile automaticamente.

### Impatto

- profilo/piano incoerenti con stato Stripe
- incidente “silenzioso” (solo log), difficile da intercettare

### Fix raccomandato

1. Per eventi critici (`checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.*`), validare `rows affected >= 1` nei passaggi chiave.
2. Se precondizioni non rispettate, trattare come failure elaborativa (500) e lasciare retry/recovery.
3. Aggiungere reconciliation path (task periodico che confronta Stripe vs DB per customer attivi).

### Criteri di accettazione

- Nessun evento critico viene marcato “processed” senza effetti DB attesi.
- Casi di mismatch generano retry o recovery deterministica.

---

## Ordine finale priorità

1. **P0-01** — dedup Stripe pre-processing (perdita eventi)
2. **P0-02** — mancato gating piano/trial su emissione/annullo
3. **P1-03** — validazione runtime assente server action cassa
4. **P1-04** — `Invalid Date` non intercettate in API list
5. **P1-05** — incoerenza timezone filtri date
6. **P1-06** — webhook ack anche con mutazioni DB nulle
