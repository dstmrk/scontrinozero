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

| Metodo | Path                     | Descrizione                         |
| ------ | ------------------------ | ----------------------------------- |
| `POST` | `/v1/receipts`           | Emetti scontrino (SALE)             |
| `POST` | `/v1/receipts/{id}/void` | Annulla scontrino                   |
| `GET`  | `/v1/receipts/{id}`      | Stato scontrino / idempotency check |

Post-MVP: `GET /v1/receipts` (lista paginata), `GET /v1/receipts/{id}/pdf`

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
  "id": "uuid",
  "status": "ACCEPTED",
  "adeTransactionId": "151085589",
  "adeProgressive": "DCW2026/5111-2188",
  "createdAt": "2026-03-26T10:00:00Z"
}
```

**Errori standard:**

- `400` — validazione input
- `401` — API key mancante, non valida, o revocata
- `402` — piano non supporta API access (upgrade a Pro/Developer)
- `422` — scontrino rifiutato dall'AdE (body include `adeErrors`)
- `429` — rate limit superato (header `Retry-After`)
- `500` — errore interno

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
export function canUseApi(plan: Plan): boolean {
  return canUsePro(plan) || isDeveloperPlan(plan);
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

| Key pattern           | Limite  | Finestra |
| --------------------- | ------- | -------- |
| `api:emit:{apiKeyId}` | 120/ora | 1h       |
| `api:void:{apiKeyId}` | 20/ora  | 1h       |
| `api:get:{apiKeyId}`  | 300/ora | 1h       |

Più generosi dei limiti UI (30 emit/ora) perché le integrazioni POS sono automatizzate.

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

## Note Operative

- Il DB supporta già N businesses per profilo (nessun UNIQUE su `businesses.profile_id`): nessuna
  modifica strutturale al modello dati per supportare developer con più esercenti.
- `onboarding-actions.ts` usa upsert (`.limit(1)`) — non blocca la creazione di più aziende.
- L'in-memory `RateLimiter` si resetta al deploy: accettabile su VPS single-process; aggiornabile
  a Redis se si scalasse a multi-istanza.
