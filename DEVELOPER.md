# ScontrinoZero — Developer API

Documentazione di prodotto e architettura tecnica per la Developer API pubblica.
Riferimento per l'implementazione delle Fasi A e B.

---

## Opportunità di Business

Sviluppatori di gestionali e POS italiani vogliono integrare l'emissione di scontrini
elettronici senza costruire da zero l'integrazione con l'Agenzia delle Entrate.
ScontrinoZero espone le proprie API come prodotto B2B2B.

---

## Due Tier di Utilizzo

### Tier 1 — Merchant + Developer (MVP, Fase A)

L'esercente si registra su ScontrinoZero, configura le credenziali AdE, attiva il piano Pro,
genera un'API key dal dashboard e la consegna al suo sviluppatore.

- **Billing:** nessun nuovo piano Stripe. API access = feature Pro (`canUsePro()`).
- **Flusso:** esercente gestisce il proprio account; developer usa la key per emettere scontrini.

### Tier 2 — Developer Account / Partner (Fase B)

Lo sviluppatore ha un proprio account "developer" su ScontrinoZero. Tramite le Management API:

- Crea le aziende dei propri clienti (business + credenziali AdE) in modo programmatico
- Ottiene API key per ciascuna azienda automaticamente
- Gli esercenti non devono mai registrarsi su ScontrinoZero (completamente headless)
- Lo sviluppatore paga in base al volume mensile di scontrini emessi (non per esercente)

**Compliance:** il developer raccoglie le credenziali Fisconline dagli esercenti (standard in Italia
per i software gestionali) e le trasmette via API. I T&C devono includere una clausola che
responsabilizza il developer per la custodia delle credenziali dei propri clienti.

---

## Vincolo Fondamentale

Ogni chiamata AdE usa le credenziali Fisconline dello specifico esercente. Non esiste
credenziale condivisa. Ogni API key è quindi sempre associata a un `business_id` preciso.

---

## Architettura Dati

### Tabella `api_keys` (nuova)

```sql
CREATE TABLE "api_keys" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"   uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "business_id"  uuid REFERENCES "businesses"("id") ON DELETE CASCADE, -- NULL = management key
  "type"         text NOT NULL DEFAULT 'business', -- 'business' | 'management'
  "name"         text NOT NULL,
  "key_hash"     text NOT NULL UNIQUE,   -- SHA-256 della raw key (hex)
  "key_prefix"   text NOT NULL,          -- prime 12 char per identificazione in UI
  "last_used_at" timestamptz,
  "expires_at"   timestamptz,            -- null = non scade
  "revoked_at"   timestamptz,            -- null = attiva
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_api_keys_key_hash"    ON "api_keys" ("key_hash");
CREATE INDEX "idx_api_keys_profile_id"  ON "api_keys" ("profile_id");
CREATE INDEX "idx_api_keys_business_id" ON "api_keys" ("business_id");
```

**Tipi di chiave:**

- `business` (`business_id = <uuid>`): emissione scontrini per quella specifica azienda
- `management` (`business_id = NULL`): accesso alle Partner Management API (Fase B)

**Prefissi visuali:** `szk_live_<48chars>` (business key), `szk_mgmt_<48chars>` (management key)

**Sicurezza:** la raw key è mostrata **una sola volta** al momento della creazione e mai
persistita. Nel DB si salva solo il SHA-256 hash (hex) e i primi 12 caratteri per l'UI.

### Colonna `api_key_id` su `commercial_documents` (nuova)

```sql
ALTER TABLE commercial_documents
  ADD COLUMN "api_key_id" uuid REFERENCES api_keys(id) ON DELETE SET NULL;
CREATE INDEX "idx_commercial_documents_api_key" ON "commercial_documents" ("api_key_id");
```

- `api_key_id IS NULL` → emissione via UI dashboard (session Supabase)
- `api_key_id IS NOT NULL` → emissione via API

Usata per il tracking del consumo mensile nei piani developer (Fase B).

### Piani Developer (nuovi valori `profiles.plan`)

```typescript
export type Plan =
  | "trial"
  | "starter"
  | "pro"
  | "unlimited" // piani esistenti
  | "developer_indie"
  | "developer_business"
  | "developer_scale"; // Fase B
```

| Piano              | Mensile | Annuale | Scontrini/mese via API | Use case           |
| ------------------ | ------- | ------- | ---------------------- | ------------------ |
| Developer Indie    | €14.99  | €149    | 300                    | 1-3 clienti        |
| Developer Business | €39.99  | €399    | 1.500                  | fino a ~25 clienti |
| Developer Scale    | €99.99  | €999    | 5.000                  | software house     |

Flat rate mensile (non per-scontrino): prevedibile per developer, semplice da implementare
con Stripe standard (no Metered Billing). Raggiunto il limite: `429` con invito a fare upgrade.

---

## API Surface

### Receipt Emission API (Tier 1 + Tier 2)

Autenticazione: `Authorization: Bearer szk_live_XXXX` (business key)
Base URL: `https://api.scontrinozero.it/v1` (stesso container, Cloudflare Tunnel hostname separato)

| Metodo | Path                     | Descrizione                                                               |
| ------ | ------------------------ | ------------------------------------------------------------------------- |
| `POST` | `/v1/receipts`           | Emetti scontrino (SALE)                                                   |
| `GET`  | `/v1/receipts`           | Lista paginata per intervallo di date (`from`/`to`/`page`/`limit`/`kind`) |
| `POST` | `/v1/receipts/{id}/void` | Annulla scontrino                                                         |
| `GET`  | `/v1/receipts/{id}`      | Stato/dettaglio scontrino / idempotency check                             |

Post-MVP: `GET /v1/receipts/{id}/pdf`

**Esempio richiesta:**

```bash
curl -X POST https://api.scontrinozero.it/v1/receipts \
  -H "Authorization: Bearer szk_live_XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "lines": [
      {
        "description": "Pizza Margherita",
        "quantity": 2,
        "grossUnitPrice": 8.00,
        "vatCode": "10"
      }
    ],
    "paymentMethod": "PE",
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
    "lotteryCode": "ABCD1234"
  }'
```

**Risposta successo (201):**

```json
{
  "documentId": "uuid",
  "adeTransactionId": "151085589",
  "adeProgressive": "DCW2026/5111-2188"
}
```

**Esempio GET scontrino:**

```bash
curl https://api.scontrinozero.it/v1/receipts/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer szk_live_XXXX"
```

**Risposta GET (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "kind": "SALE",
  "status": "ACCEPTED",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "adeTransactionId": "151085589",
  "adeProgressive": "DCW2026/5111-2188",
  "createdAt": "2026-03-26T10:00:00Z",
  "paymentMethod": "PE",
  "lotteryCode": "ABCD1234",
  "voidedDocumentId": null,
  "total": "16.00",
  "lines": [
    {
      "description": "Pizza Margherita",
      "quantity": "2.000",
      "grossUnitPrice": "8.00",
      "vatCode": "10"
    }
  ]
}
```

> `voidedDocumentId` è valorizzato solo per documenti `kind: "VOID"` e contiene l'UUID del SALE annullato.
> `paymentMethod` vale `"PC"` (contante: denaro, assegni bancari e circolari) oppure `"PE"` (elettronico: carte, bancomat, app di pagamento, bonifici). Un solo metodo per documento — il pagamento ripartito non è supportato.
> `lotteryCode` è `null` se non fornito o se il metodo di pagamento è `"PC"` (contanti).
> `quantity` e `grossUnitPrice` sono stringhe con precisione fissa (3 e 2 decimali rispettivamente).

**Risposta annullo (200) — `POST /v1/receipts/{id}/void`:**

```json
{
  "voidDocumentId": "uuid",
  "adeTransactionId": "151086012",
  "adeProgressive": "DCW2026/5111-2611"
}
```

**Errori standard:**

> ⚠️ **Breaking change (v1.6.0).** L'envelope d'errore è cambiato: il campo
> `error` **non esiste più**, sostituito da `message`, e ogni errore ora porta
> sempre un `code` (prima era presente solo su alcuni `409`/`503`). Vedi
> [Migrazione envelope d'errore](#migrazione-envelope-derrore).

Tutte le risposte d'errore hanno esattamente questo envelope, su ogni endpoint
`/api/v1/*` e ogni status:

```json
{
  "code": "PENDING_IN_PROGRESS",
  "message": "Una richiesta con la stessa idempotencyKey è ancora in corso.",
  "requestId": "9f1c2f5e-7b3a-4c1d-9e8f-2a6b0d4c7e11"
}
```

- **`code`** — stringa machine-readable, **stabile**: è il campo su cui fare
  branching. La tabella qui sotto è l'elenco completo.
- **`message`** — testo in italiano pensato per un operatore umano. **Non è
  contratto**: può cambiare senza preavviso, non farne parsing.
- **`requestId`** — UUID della richiesta, ripetuto nell'header `X-Request-Id`
  (presente anche sulle risposte **di successo**). È il riferimento da citare
  in una segnalazione: ci permette di ritrovare la richiesta nei log.

**Non esiste un campo `adeErrors`.**

Header rilevanti: `X-Request-Id` su ogni risposta; `Retry-After` (secondi) sui
soli errori ritentabili. Entrambi sono in `Access-Control-Expose-Headers`,
quindi leggibili anche da un client browser cross-origin.

| Status | `code`                                             | Ritentabile                | Significato                                                                                                                                               |
| ------ | -------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `INVALID_BODY`                                     | no                         | Corpo assente o non JSON                                                                                                                                  |
| `400`  | `VALIDATION_ERROR`                                 | no                         | Corpo JSON valido ma fuori schema (campo mancante, tipo errato, UUID non valido)                                                                          |
| `400`  | `INVALID_QUERY_PARAM`                              | no                         | Parametro di query malformato: `from`/`to` mancanti o non `YYYY-MM-DD`, intervallo > 31 giorni, `page`/`limit` non interi o `< 1`, `kind` ≠ `SALE`/`VOID` |
| `400`  | `INVALID_ID`                                       | no                         | UUID nel path non valido                                                                                                                                  |
| `401`  | `UNAUTHORIZED`                                     | no                         | API key mancante, non valida, revocata o scaduta                                                                                                          |
| `402`  | `PLAN_UPGRADE_REQUIRED`                            | no                         | Il piano attivo non include l'accesso API (upgrade a Pro/Developer)                                                                                       |
| `403`  | `BUSINESS_KEY_REQUIRED`                            | no                         | Serve una business key `szk_live_`; usata una management key                                                                                              |
| `404`  | `NOT_FOUND`                                        | no                         | Scontrino inesistente o di un altro esercente. Vale per `GET /v1/receipts/{id}` e per l'annullo                                                           |
| `409`  | `PENDING_IN_PROGRESS` · `VOID_PENDING_IN_PROGRESS` | **sì** (`Retry-After: 2`)  | Una richiesta con la stessa `idempotencyKey` è ancora in corso                                                                                            |
| `409`  | `ALREADY_REJECTED`                                 | no                         | La key identifica un documento rifiutato dall'AdE: serve una key nuova                                                                                    |
| `409`  | `ALREADY_VOIDED`                                   | no                         | La key identifica uno scontrino già annullato: serve una key nuova                                                                                        |
| `409`  | `VOID_ALREADY_TARGETED`                            | no                         | Annullo concorrente già in corso sullo stesso SALE                                                                                                        |
| `409`  | `IDEMPOTENCY_PAYLOAD_MISMATCH`                     | no                         | Key riusata con un payload diverso **o** fra emissione e annullo: usa una key nuova                                                                       |
| `409`  | `ADE_REAUTH_REQUIRED`                              | no (azione umana)          | Sessione AdE (CIE) scaduta: va rinnovata **dall'app web ScontrinoZero**. Nessun retry automatico è utile                                                  |
| `409`  | `ADE_PASSWORD_EXPIRED`                             | no (azione umana)          | Password Fisconline scaduta: va aggiornata **dall'app web ScontrinoZero**                                                                                 |
| `413`  | `PAYLOAD_TOO_LARGE`                                | no                         | Corpo oltre il limite dell'endpoint (32 KB su emissione, 8 KB su annullo)                                                                                 |
| `422`  | `ADE_REJECTED`                                     | no                         | L'AdE ha rifiutato il documento nel merito, o mancano dati fiscali. Il documento **non** è stato registrato: correggilo                                   |
| `429`  | `RATE_LIMIT_EXCEEDED`                              | **sì** (`Retry-After`)     | Rate limit superato                                                                                                                                       |
| `500`  | `VOID_SYNC_FAILED`                                 | no (richiede intervento)   | Annullo registrato su AdE ma sync DB fallita                                                                                                              |
| `500`  | `INTERNAL_ERROR`                                   | no                         | Fallimento inatteso lato nostro                                                                                                                           |
| `503`  | `DB_TIMEOUT`                                       | **sì** (`Retry-After: 5`)  | Servizio temporaneamente sovraccarico                                                                                                                     |
| `503`  | `ADE_UNAVAILABLE`                                  | **sì** (`Retry-After: 10`) | L'AdE non ha risposto (rete, 5xx, timeout SPID): esito della trasmissione **ignoto**                                                                      |

> ⚠️ **Ritenta sempre con la stessa `idempotencyKey`.** Vale per tutti i codici
> ritentabili, ma è critico su `ADE_UNAVAILABLE`: lì l'esito della trasmissione
> è ignoto e il documento potrebbe essere già stato registrato dall'AdE.
> Riprovare con una key nuova produrrebbe un **doppione fiscale
> irreversibile**; riprovare con la stessa key è sicuro — il sistema riconcilia
> con l'AdE prima di ritrasmettere e ti risponde `PENDING_IN_PROGRESS` finché
> la verifica è in corso.

**Come trattare un errore, in pratica:**

1. `Retry-After` presente → attendi quei secondi e ritenta **identica**
   (stessa `idempotencyKey`), con un tetto di tentativi.
2. `409` `ADE_REAUTH_REQUIRED` / `ADE_PASSWORD_EXPIRED` → non ritentare:
   avvisa l'esercente che deve entrare nell'app web ScontrinoZero.
3. Tutto il resto → è un errore permanente: logga `code` + `requestId` e
   correggi la richiesta.

#### Migrazione envelope d'errore

| Prima (≤ v1.5.x)                       | Ora (≥ v1.6.0)                                          |
| -------------------------------------- | ------------------------------------------------------- |
| `{ "error": "…" }`                     | `{ "code": "…", "message": "…", "requestId": "…" }`     |
| `code` solo su alcuni `409`/`503`      | `code` **sempre** presente                              |
| `422` generico per ogni fallimento AdE | `503 ADE_UNAVAILABLE` (transient) vs `422 ADE_REJECTED` |
| `422` per password Fisconline scaduta  | `409 ADE_PASSWORD_EXPIRED`                              |
| nessun identificativo di richiesta     | `requestId` nel body + header `X-Request-Id`            |

Per adeguare un client esistente:

- sostituisci ogni lettura di `body.error` con `body.message` (o meglio: passa
  a `body.code`, che è l'unico campo su cui si può fare branching stabile);
- se trattavi il `422` come "errore definitivo", verifica di gestire il nuovo
  `503 ADE_UNAVAILABLE` come **ritentabile con la stessa key** — è la modifica
  che più cambia il comportamento;
- salva il `requestId` nei tuoi log: dimezza i tempi di una segnalazione.

> ⚠️ **La idempotency key deve essere unica per operazione.** Emissione e
> annullo non condividono mai la stessa `idempotencyKey`: riusarla tra le due
> operazioni ritorna `409 IDEMPOTENCY_PAYLOAD_MISMATCH`. Genera una key nuova
> per ogni transazione (emit e void inclusi).

### Partner Management API (Tier 2 — Fase B)

Autenticazione: `Authorization: Bearer szk_mgmt_XXXX` (management key)

| Metodo   | Path                                       | Descrizione                                            |
| -------- | ------------------------------------------ | ------------------------------------------------------ |
| `POST`   | `/v1/partner/businesses`                   | Crea esercente + credenziali AdE + genera business key |
| `GET`    | `/v1/partner/businesses`                   | Lista esercenti con usage mensile                      |
| `GET`    | `/v1/partner/businesses/{id}`              | Dettaglio + usage                                      |
| `POST`   | `/v1/partner/businesses/{id}/keys`         | Genera nuova business key                              |
| `DELETE` | `/v1/partner/businesses/{id}/keys/{keyId}` | Revoca business key                                    |

**Esempio: crea esercente (POST /v1/partner/businesses):**

```json
{
  "businessName": "Pizzeria Mario",
  "vatNumber": "IT01234567890",
  "fiscalCode": "MRRMRA80A01H501Z",
  "address": "Via Roma",
  "streetNumber": "1",
  "city": "Roma",
  "province": "RM",
  "zipCode": "00100",
  "adeCredentials": {
    "codiceFiscale": "MRRMRA80A01H501Z",
    "password": "fisconline_password",
    "pin": "12345"
  }
}
```

**Risposta (201) — la `apiKeyRaw` è mostrata UNA sola volta:**

```json
{
  "businessId": "uuid",
  "apiKeyId": "uuid",
  "apiKeyPrefix": "szk_live_XXX",
  "apiKeyRaw": "szk_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

---

## Architettura Codice

### Refactor: estrazione service layer

Le server actions attuali (`emitReceipt`, `voidReceipt`) mixano auth sessione + logica business.
Per condividere la logica con le API routes (che usano API key, non session cookie):

```
src/server/receipt-actions.ts         → auth (Supabase session) + rate limit → delega
src/server/void-actions.ts            → auth (Supabase session) + rate limit → delega
src/lib/services/receipt-service.ts   → pura logica: emitReceiptForBusiness({ businessId, apiKeyId?, input })
src/lib/services/void-service.ts      → pura logica: voidReceiptForBusiness({ businessId, apiKeyId?, input })
src/app/api/v1/receipts/route.ts      → auth (API key) + rate limit → chiama service
```

`apiKeyId` è opzionale nel service: `undefined` = UI session (non tracciato), `uuid` = API call
(salvato su `commercial_documents.api_key_id`).

### Nuove funzioni gate in `plans.ts`

```typescript
// Il trial e' una prova di Pro e include l'accesso API (1 chiave, vedi
// API_KEY_LIMITS). `trialStartedAt` va passato dal call site: omesso, il
// trial resta gated — default safe per chi se lo dimentica.
export function canUseApi(
  plan: Plan,
  planExpiresAt: Date | null = null,
  trialStartedAt: Date | null = null,
): boolean {
  if (isPaidPlanExpired(plan, planExpiresAt)) return false;
  return (
    canUsePro(plan, planExpiresAt, trialStartedAt) || isDeveloperPlan(plan)
  );
}

export function isDeveloperPlan(plan: Plan): boolean {
  return plan.startsWith("developer_");
}

export const DEVELOPER_MONTHLY_LIMITS: Partial<Record<Plan, number>> = {
  developer_indie: 300,
  developer_business: 1500,
  developer_scale: 5000,
};
```

### Tracking consumo mensile (Fase B)

Query per verifica limite prima dell'emissione (aggregazione live, fast con indice):

```sql
SELECT COUNT(*) FROM commercial_documents cd
JOIN businesses b ON cd.business_id = b.id
WHERE b.profile_id = $developer_profile_id
  AND cd.api_key_id IS NOT NULL
  AND cd.kind = 'SALE'
  AND cd.status = 'ACCEPTED'
  AND cd.created_at >= date_trunc('month', NOW())
```

### Rate Limits API

| Key pattern           | Endpoint                      | Limite  | Finestra |
| --------------------- | ----------------------------- | ------- | -------- |
| `api:emit:{apiKeyId}` | `POST /v1/receipts`           | 120/ora | 1h       |
| `api:list:{apiKeyId}` | `GET /v1/receipts`            | 60/ora  | 1h       |
| `api:void:{apiKeyId}` | `POST /v1/receipts/{id}/void` | 20/ora  | 1h       |

`GET /v1/receipts/{id}` (lettura singola indicizzata) non ha rate limiter
dedicato. L'emissione è **allineata alla cassa** (`emit:{userId}`, 120/ora): lo
stesso account non può avere in UI un tetto più basso di quello che ottiene via
API (REVIEW.md #72). L'elenco completo dei bucket è nella skill
`testing-patterns`.

---

## Infrastruttura: `api.scontrinozero.it`

Zero nuovi container. Con Cloudflare Tunnel:

1. Aggiungere Public Hostname nel tunnel esistente: `api.scontrinozero.it` → `http://localhost:3000`
2. `proxy.ts`: aggiungere `api.scontrinozero.it` tra gli hostname riconosciuti (nessun redirect auth)
3. `next.config.ts`: regola CORS separata per `/api/v1/*` con `Access-Control-Allow-Origin: *`
   (i developer chiamano dal loro backend; l'attuale CORS blocca tutto a `NEXT_PUBLIC_APP_URL`)
4. `/api/v1/*` escluso dal matcher Supabase session refresh in `proxy.ts`
5. Ambiente test: `api.test.scontrinozero.it` → container test

---

## Piano di Implementazione

### Fase A — MVP (Tier 1)

| Task | File (max 3)                                                                                                                                     | Descrizione                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| A1   | `src/db/schema/api-keys.ts`, `src/db/schema/index.ts`, `supabase/migrations/0004_add_api_keys.sql`                                               | DB schema + Drizzle types                 |
| A2   | `src/db/schema/commercial-documents.ts`, `supabase/migrations/0005_api_keys_rls.sql`, `supabase/migrations/0006_add_api_key_id_to_documents.sql` | api_key_id su documents + RLS             |
| A3   | `src/lib/api-keys.ts`, `src/lib/api-auth.ts`, `src/lib/api-auth.test.ts`                                                                         | Key generation + auth middleware          |
| A4   | `src/lib/plans.ts`, `src/lib/plans.test.ts`, `src/lib/stripe.ts`                                                                                 | Nuove funzioni gate + developer price IDs |
| A5   | `src/lib/services/receipt-service.ts`, `src/lib/services/receipt-service.test.ts`, `src/server/receipt-actions.ts`                               | Service layer receipt                     |
| A6   | `src/lib/services/void-service.ts`, `src/lib/services/void-service.test.ts`, `src/server/void-actions.ts`                                        | Service layer void                        |
| A7   | `src/app/api/v1/receipts/route.ts`, `src/app/api/v1/receipts/route.test.ts`, `src/app/api/v1/receipts/[id]/route.ts`                             | POST emit + GET status                    |
| A8   | `src/app/api/v1/receipts/[id]/void/route.ts`, `src/app/api/v1/receipts/[id]/void/route.test.ts`                                                  | POST void                                 |
| A9   | `next.config.ts`, `src/proxy.ts`, `src/proxy.test.ts`                                                                                            | CORS + middleware hostname                |
| A10  | `src/server/api-key-actions.ts`, `src/server/api-key-actions.test.ts`, `src/app/dashboard/developer/page.tsx`                                    | Dashboard UI gestione chiavi              |

### Fase B — Partner/Developer Account (Tier 2)

| Task | File (max 3)                                                                                                                 | Descrizione                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| B1   | `src/app/api/v1/partner/businesses/route.ts`, `src/app/api/v1/partner/businesses/route.test.ts`                              | Partner: POST create + GET list        |
| B2   | `src/app/api/v1/partner/businesses/[id]/keys/route.ts`, `src/app/api/v1/partner/businesses/[id]/keys/[keyId]/route.ts`, test | Partner: gestione chiavi               |
| B3   | `src/app/dashboard/developer/partner/page.tsx`                                                                               | Dashboard multi-business per developer |
| B4   | `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`                                                | Stripe developer plans                 |

---

## Sandbox

`api-sandbox.scontrinozero.it` (`ADE_MODE=mock`, Stripe test): stessa surface
della produzione, nessun documento trasmesso all'AdE. Un account registrato su
`sandbox.scontrinozero.it` parte in trial e puo' quindi generare subito una
chiave — nessun pagamento serve per provare l'integrazione. Il piano Pro, utile
per testare il flusso di abbonamento o il limite di 3 chiavi, si attiva con una
carta di test Stripe (`4242 4242 4242 4242`, scadenza futura qualsiasi, CVC
qualsiasi). Documentato per gli utenti in `/help/api`, sezione Sandbox.

## Note Operative

- Il DB supporta già N businesses per profilo (nessun UNIQUE su `businesses.profile_id`): nessuna
  modifica strutturale al modello dati per supportare developer con più esercenti.
- `onboarding-actions.ts` usa upsert (`.limit(1)`) — non blocca la creazione di più aziende.
- L'in-memory `RateLimiter` si resetta al deploy: accettabile su VPS single-process; aggiornabile
  a Redis se si scalasse a multi-istanza.
