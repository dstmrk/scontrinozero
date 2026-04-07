# REVIEW — Analisi approfondita codice (sicurezza, performance, funzionalità, architettura)

Data analisi: 2026-04-07

## Metodo usato

Ho eseguito una review a passate successive, fermandomi solo quando alla passata X+1 non sono emerse issue nuove rispetto alla passata X.

- **Passata 1**: core backend (auth, API v1, receipt/void service, webhook Stripe, schema DB, onboarding).
- **Passata 2**: superfici residue (route pubbliche receipt/PDF, middleware/proxy, billing checkout/portal, mapper/importi, validazioni input).
- **Passata 3**: contro-verifica completa mirata sulle aree già toccate + ricerca cross-file di casi limite; **nessuna nuova issue** rispetto alla passata 2.

## Verifica preventiva contro `PLAN.md`

Prima di elencare i findings ho escluso i miglioramenti già pianificati in `PLAN.md` (B1..B8), quindi **non** ho duplicato:

- dedup webhook Stripe
- paginazione storico/export
- key rotation zero-downtime
- error envelope uniforme API
- TTL/revoca link pubblici
- enforcement limiti mensili Developer API
- stale PENDING recovery idempotency
- hostname allowlist CAPTCHA

---

## Findings ordinati per priorità

## P1 — Mancano limiti espliciti alla dimensione dei body JSON su endpoint sensibili (rischio memory/CPU DoS)

### Dove

- `src/app/api/v1/receipts/route.ts` (`request.json()` senza pre-check di size)
- `src/app/api/v1/receipts/[id]/void/route.ts`
- `src/app/api/stripe/checkout/route.ts`

### Problema

Gli handler accettano e parsano direttamente il body (`await request.json()`) senza enforce di limite esplicito (es. 16–64KB) prima del parsing. Un client può inviare payload molto grandi e costringere il processo Node a:

1. bufferizzare tutto in memoria,
2. fare parse JSON,
3. validare con Zod.

Su singolo container, poche richieste oversized concorrenti possono causare pressione memoria/GC e degradare la disponibilità.

### Impatto

- **Sicurezza/affidabilità**: degradazione servizio (DoS applicativo a basso costo).
- **Performance**: latenza elevata e aumento CPU/GC.

### Fix consigliato (non ambiguo)

1. Implementare helper condiviso `readJsonWithLimit(request, maxBytes)` che:
   - legge stream a chunk,
   - interrompe con `413 Payload Too Large` al superamento soglia,
   - poi fa `JSON.parse` sicuro.
2. Applicare il helper a tutte le route JSON write-heavy.
3. Definire limiti per endpoint:
   - receipts create/void: es. 32KB
   - checkout/portal-like JSON: es. 8KB
4. Aggiungere test unit/integration:
   - payload sotto soglia -> 2xx/4xx funzionale
   - payload oltre soglia -> 413 deterministico.

### Definition of Done

- Nessun endpoint citato usa più `request.json()` diretto senza guardrail size.
- Test automatici green per ramo `413`.

---

## P1 — Validazione monetaria incompleta: non viene imposto il numero massimo di decimali coerente con il DB fiscale

### Dove

- `src/app/api/v1/receipts/route.ts` (schema Zod per `quantity`, `grossUnitPrice`)
- `src/types/cassa.ts` (importi/quantità come `number`)
- `src/lib/services/receipt-service.ts` e `src/lib/ade/mapper.ts` (calcoli su floating point)
- `src/db/schema/commercial-document-lines.ts` (vincoli DB: `quantity numeric(10,3)`, `gross_unit_price numeric(10,2)`)

### Problema

L’API accetta numeri positivi ma non limita formalmente la scala decimale lato input (es. `grossUnitPrice = 12.9999`, `quantity = 0.123456`).
Il DB poi forza precision/scale (`10,2` e `10,3`) con rounding/troncamenti impliciti. Questo crea rischio di mismatch tra:

- totale percepito dal client,
- totale persistito DB,
- totale inviato ad AdE.

In dominio fiscale, anche micro-disallineamenti sono ad alta criticità.

### Impatto

- **Funzionale/fiscale**: possibili centesimi incoerenti tra UI, DB, payload AdE.
- **Architettura**: semantica importi fragile (uso `number` binary floating per valori monetari).

### Fix consigliato (non ambiguo)

1. Enforce scale in validazione API/UI:
   - `grossUnitPrice`: max 2 decimali
   - `quantity`: max 3 decimali
2. Normalizzare input prima dei calcoli (`toFixed`/decimal lib) e rifiutare valori fuori scala con errore esplicito.
3. Centralizzare modello monetario:
   - opz A: decimal library (`decimal.js`) end-to-end;
   - opz B: int minor units (centesimi/millesimi) + conversione in boundary layers.
4. Aggiungere test con casi edge (`0.1 + 0.2`, 3+ decimali, rounding boundaries).

### Definition of Done

- Nessuna richiesta con scala non consentita passa la validazione.
- Totali UI/DB/AdE coincidono nei test golden.

---

## P2 — Doppio fetch non necessario sulla pagina ricevuta pubblica (metadata + page), con costo DB evitabile

### Dove

- `src/app/r/[documentId]/page.tsx`
  - `generateMetadata()` chiama `fetchPublicReceipt(documentId)`
  - la pagina chiama di nuovo `fetchPublicReceipt(documentId)`

### Problema

Per ogni visita si effettuano query duplicate per lo stesso documento (e righe), aumentando carico DB e latenza. Su endpoint pubblici questo overhead scala male.

### Impatto

- **Performance**: roundtrip DB raddoppiati per view.
- **Costi**: consumo inutile risorse su traffico pubblico.

### Fix consigliato (non ambiguo)

1. Introdurre caching request-scoped (es. `cache()` di React/Next) per `fetchPublicReceipt`.
2. Oppure fare metadata minimale senza query completa (titolo statico + no data-sensitive description).
3. Verificare che non si introducano inconsistenze di cache per documenti non trovati.

### Definition of Done

- In una singola request della pagina pubblica, query al DB eseguite una sola volta per documento.
- Test/strumentazione conferma riduzione query.

---

## P2 — Operazioni multi-step in `verifyAdeCredentials` non completamente atomiche (possibili stati parziali)

### Dove

- `src/server/onboarding-actions.ts` (`verifyAdeCredentials`)

### Problema

Nel flusso di verifica credenziali avvengono più update separati:

1. update `businesses` (vat/fiscal data)
2. update `profiles.partitaIva`
3. update `adeCredentials.verifiedAt`

Alcuni errori sono gestiti come non bloccanti; altri rientrano in path di errore. In caso di failure intermedia si possono avere stati parziali (es. business aggiornato ma `verifiedAt` non coerente, o viceversa).

### Impatto

- **Funzionale**: onboarding in stato ibrido difficile da diagnosticare.
- **Architettura**: invarianti di dominio non esplicitati in transazione.

### Fix consigliato (non ambiguo)

1. Definire chiaramente invarianti (es. quando `verifiedAt` può essere valorizzato).
2. Raggruppare update DB correlati in una transaction unica quando devono essere all-or-nothing.
3. Distinguere explicitamente errori bloccanti vs best-effort con codici stato interni.
4. Aggiungere test di fault injection (errore tra step 1 e 2, tra step 2 e 3).

### Definition of Done

- Nessuna combinazione di errori lascia record in stato non rappresentabile dalle regole di dominio.
- Test di failure path coperti.

---

## P2 — Mancano vincoli di lunghezza/shape su alcuni campi testuali persistiti (rischio abuso storage e degrado query/UI)

### Dove

- `src/server/api-key-actions.ts` (`name` validato solo `trim` non vuoto)
- `src/server/catalog-actions.ts` (`description` solo non vuota)
- `src/server/onboarding-actions.ts` (più campi indirizzo/ragione sociale con validazioni minime)
- Tabelle DB correlate (`text` senza limiti applicativi coerenti)

### Problema

Input autenticati ma non bounded possono essere enormi (stringhe molto lunghe), impattando:

- storage,
- serializzazione JSON,
- rendering UI,
- tempi query/sort.

### Impatto

- **Performance**: payload e record molto grandi.
- **Manutenibilità**: regressioni UI difficili da prevenire.

### Fix consigliato (non ambiguo)

1. Definire policy lunghezze massime per dominio (es. key name 64, catalog desc 200, businessName 120, city 80, ecc.).
2. Applicare validazione shared (Zod/schema helper) lato server action e API.
3. Opzionale: aggiungere constraint DB/check per campi critici.
4. Coprire test boundary (max, max+1).

### Definition of Done

- Ogni campo utente ad alta visibilità ha limite documentato e testato.
- Messaggi errore user-friendly su overflow.

---

## P3 — Normalizzazione email incoerente tra flussi auth (signup vs signin/reset/magic link)

### Dove

- `src/server/auth-actions.ts`
  - `signUp`: trim + lowercase
  - `signIn`, `signInWithMagicLink`, `resetPassword`: nessuna normalizzazione equivalente

### Problema

La gestione non uniforme dell’email può produrre comportamenti confusi (es. utente inserisce maiuscole/spazi e ottiene errori evitabili), soprattutto su flussi login/reset.

### Impatto

- **Funzionale/UX**: falsi errori di autenticazione o reset.
- **Support burden**: ticket evitabili.

### Fix consigliato (non ambiguo)

1. Introdurre helper unico `normalizeEmail(input)` usato in tutti i flussi auth.
2. Applicare sempre `trim().toLowerCase()` prima di validazione e chiamate Supabase.
3. Aggiungere test cross-flusso con varianti casing/whitespace.

### Definition of Done

- Tutti i flussi auth trattano email in modo uniforme.
- Test regressione presenti.

---

## P3 — Gestione errori esterni non uniforme in alcune route Stripe (affidabilità e diagnosi)

### Dove

- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/portal/route.ts`

### Problema

Le chiamate Stripe principali non hanno wrapping locale coerente con logging strutturato/response controllata per tutti i failure modes (timeout, rete, Stripe 5xx). Alcuni errori possono propagare come 500 generico senza contesto applicativo utile.

### Impatto

- **Affidabilità operativa**: troubleshooting più lento.
- **UX**: errori poco azionabili lato client.

### Fix consigliato (non ambiguo)

1. Wrappare chiamate Stripe critiche con mapping errore esplicito (temporaneo vs permanente).
2. Loggare `requestId`/`userId`/operation in modo consistente.
3. Restituire payload errore stabile lato frontend billing.
4. Testare rami error mocked Stripe client.

### Definition of Done

- Per ogni chiamata Stripe critica esiste ramo errore esplicito testato.
- Log e response semantici e consistenti.

---

## Esito convergenza passate

- **Passata 1**: trovate issue iniziali (P1/P2/P3).
- **Passata 2**: trovate ulteriori issue (doppio fetch public receipt, coerenza normalizzazione auth, robustezza Stripe).
- **Passata 3**: nessuna nuova issue rispetto a passata 2.

**Conclusione:** set findings considerato convergente alla passata 3.
