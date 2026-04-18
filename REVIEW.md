# REVIEW — analisi multi-pass (focus sui commit ultimi 7 giorni)

Data analisi: 2026-04-17  
Scope principale: modifiche introdotte tra il 2026-04-10 e il 2026-04-17, con controllo mirato su sicurezza, funzionalità, performance, architettura e bad practices.

## Metodo usato

1. Ho letto `PLAN.md` per evitare duplicati già pianificati (B1…B11, v1.2.6).
2. Ho estratto file/commit dell’ultima settimana (`git log --since='7 days ago'`).
3. Ho effettuato passate successive sul codice backend critico (Stripe webhook, API v1 receipts, server actions storico/profilo, servizi emissione/annullo).
4. Ho ripetuto la review finché una passata non ha prodotto nuove issue rispetto alla precedente.

---

## Esito passate

### Passata 1

Trovate issue: **R-01, R-02, R-03**.

### Passata 2

Trovate nuove issue: **R-04**.

### Passata 3

**Nessuna nuova issue** rispetto alla Passata 2.  
=> Stop del ciclo X+1.

---

## Findings ordinati per priorità

## P0 (critico)

### R-01 — Validazione date non stretta: date impossibili vengono accettate e “normalizzate” da `Date`

**Categoria:** Funzionalità + Integrità dati + Sicurezza logica  
**Aree impattate:** API v1 list receipts, storico dashboard

#### Evidenza

- In `src/app/api/v1/receipts/route.ts` la validazione usa regex `YYYY-MM-DD` + `new Date("...T00:00:00.000Z")` + check `isNaN`. Questo NON intercetta date impossibili come `2026-02-31`, che JS normalizza a marzo.
- Stesso pattern in `src/server/storico-actions.ts` (`parseIsoDate`), con effetto analogo.

#### Impatto reale

- Filtri temporali non affidabili (l’utente crede di chiedere una finestra, il backend ne applica un’altra).
- Possibili risultati incoerenti tra UI/API e debugging molto difficile.
- Rischio di query più ampie del previsto (impatto performance indiretto).

#### Come riprodurre

1. Chiamare `GET /api/v1/receipts?from=2026-02-31&to=2026-03-01`.
2. Osservare che la richiesta non viene rifiutata come data non valida.

#### Fix richiesto (ambiguity-free)

1. Introdurre un parser ISO calendar-safe condiviso (es. `parseStrictIsoDateUtc`) in un modulo comune (es. `src/lib/date-utils.ts`), con logica:
   - regex `^\d{4}-\d{2}-\d{2}$`
   - parse numerico `year, month, day`
   - costruzione UTC con `Date.UTC`
   - round-trip check: anno/mese/giorno ottenuti dalla `Date` devono coincidere con input (altrimenti data impossibile).
2. Usare **solo** quel parser in:
   - `src/app/api/v1/receipts/route.ts`
   - `src/server/storico-actions.ts`
3. Se la data non è valida, ritornare 400 esplicito in API e errore strutturato nella server action (non silent ignore).
4. Aggiungere test di regressione per date impossibili (`2026-02-31`, `2026-13-01`, `2026-00-10`, `2026-04-31`).

#### Acceptance criteria

- Le date impossibili sono rifiutate deterministicamente.
- Nessun percorso usa `new Date(isoString)` come unico validatore.

---

## P1 (alto)

### R-02 — `searchReceipts` ignora silenziosamente date invalide e può allargare la query senza volerlo

**Categoria:** Sicurezza logica + Performance + UX diagnostica  
**Aree impattate:** storico dashboard (`src/server/storico-actions.ts`)

#### Evidenza

- Se `params.dateFrom`/`params.dateTo` sono invalidi, il codice non fallisce: non applica il filtro e prosegue (`if (d) push condition`, altrimenti niente).

#### Impatto reale

- Input corrotti/tampered possono trasformare una query filtrata in query ampia senza segnale di errore.
- Aumento carico DB e risultati sorprendenti lato utente.

#### Fix richiesto

1. Cambiare comportamento da “silent ignore” a “fail fast”: se `dateFrom`/`dateTo` presenti ma invalidi, ritornare errore esplicito (es. `throw new Error("Filtro data non valido")` con codice machine-readable nel layer chiamante).
2. Normalizzare il contratto con API v1: stessi criteri di validazione, stessi edge-case.
3. Coprire con test unitari:
   - `dateFrom` invalida → errore
   - `dateTo` invalida → errore
   - entrambe invalide → errore

#### Acceptance criteria

- Nessuna query parte con filtro data richiesto ma non applicato.

---

### R-03 — Webhook Stripe: `priceId` sconosciuto viene acknowledged (200) e blocca recovery automatica

**Categoria:** Affidabilità + Funzionalità billing  
**Aree impattate:** `src/app/api/stripe/webhook/route.ts`

#### Evidenza

- In `syncSubscriptionData`, se `planFromPriceId(priceId)`/`intervalFromPriceId(priceId)` falliscono, il codice fa solo log + `return` (“skipping plan update”).
- L’evento però resta claimato come processato (pattern INSERT-first), quindi Stripe non ritenterà utilmente.

#### Impatto reale

- In caso di nuovo prezzo Stripe non ancora configurato in env/app, l’utente può pagare ma rimanere con piano locale non aggiornato (desync persistente).
- Recovery manuale obbligata, rischio revenue/support incident.

#### Fix richiesto

1. Trattare `priceId` sconosciuto come errore retryable: lanciare eccezione in `syncSubscriptionData`.
2. Lasciare che `processWithClaimRelease` rilasci claim e risponda 500, consentendo retry Stripe.
3. Aggiungere test:
   - `checkout.session.completed` con `priceId` ignoto -> risposta 500
   - claim eliminato su errore
   - evento poi processabile dopo config corretta
4. (Opzionale ma consigliato) aggiungere alerting dedicato con tag `unknown_price_id`.

#### Acceptance criteria

- Nessun evento con prezzo ignoto viene marcato come definitivamente processato.

---

### R-04 — Controllo intervallo “31 giorni” off-by-one nell’API list

**Categoria:** Funzionalità + Performance guardrail  
**Aree impattate:** `src/app/api/v1/receipts/route.ts`

#### Evidenza

- `diffDays = (to - from) / day` e check `if (diffDays > MAX_RANGE_DAYS)`.
- Con range inclusivo (from e to inclusi), questo permette di fatto **32 giorni** quando `diffDays === 31`.

#### Impatto reale

- Il limite dichiarato all’utente (“massimo 31 giorni”) non è rispettato rigidamente.
- Carico query leggermente maggiore del previsto.

#### Fix richiesto

1. Definire in modo esplicito la semantica del range (inclusivo consigliato).
2. Se inclusivo: calcolare `inclusiveDays = diffDays + 1` e validare `inclusiveDays <= MAX_RANGE_DAYS`.
3. Aggiornare messaggi e test per edge case:
   - 31 giorni inclusivi -> OK
   - 32 giorni inclusivi -> 400

#### Acceptance criteria

- Coerenza matematica tra limite dichiarato e limite applicato.

---

## Note di allineamento con PLAN.md

Ho escluso esplicitamente item già presenti nel piano/backlog (es. B1 dedup webhook, B2 paginazione cursor-based, B9 claim recovery job, B10 rows_affected check, B11 customer orfani Stripe).  
I finding sopra sono **nuovi o non coperti completamente** rispetto al piano corrente.
