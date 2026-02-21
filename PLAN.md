# ScontrinoZero — Piano di sviluppo

## Contesto

Phase 0, 1A, 2A-2C, 1B (parziale), 3A, 3B, 4A completate. Il progetto ha 214 unit test + 8 E2E test.
Modulo AdE completo (MockAdeClient + RealAdeClient) con 92 test dedicati.
Infrastruttura sicurezza: logger (pino), rate limiting, encryption (AES-256-GCM), Sentry.
Auth: Supabase Auth con middleware, onboarding wizard 3-step, credenziali AdE cifrate.
Schema DB scontrini: tabelle `commercial_documents` + `commercial_document_lines` con migration.
Prossimo step: Phase 4B (UI cassa mobile-first).

---

## Sequenza

### Phase 1A: Fix security + stabilire pattern di test ✅

- ✅ `src/lib/validation.ts` — `isValidEmail()` lineare (no regex backtracking)
- ✅ `src/lib/validation.test.ts` — 13 test TDD
- ✅ `src/app/api/waitlist/route.test.ts` — 7 test con mock Drizzle
- ✅ SonarCloud issues risolte (readonly props, deprecated icons/types, CSS)
- **Risultato:** 23 test totali, SonarCloud quality gate verde

---

### Phase 2: Integrazione AdE

**2A: Ricerca e documentazione ✅**

- ✅ Analizzati 17 file HAR (login, vendita, annullo, ricerca, rubrica, logout, full flow)
- ✅ Analizzato codice C# di riferimento (Send.cs, DC.cs, Esiti.cs)
- ✅ Creata specifica completa `docs/api-spec.md` (auth, endpoint, payload, mapping, validazioni, persistenza)
- ✅ Flusso auth Fisconline mappato in 6 fasi (da Send.cs + login_fol.har)
- ✅ Pulizia docs/: rimossi file C#, Swagger, HAR, PDF; resta solo api-spec.md

**2B: Interface design + MockAdeClient (3-5 giorni) ✅**

- Definire tipi TypeScript basati su `docs/api-spec.md` sez. 3-7:
  - `src/lib/ade/types.ts` — payload AdE (vendita/annullo), risposta, codifiche IVA, pagamenti
  - `src/lib/ade/public-types.ts` — DTO API pubblica (SaleRequest, VoidRequest, Response)
- Definire interfaccia `AdeClient` in `src/lib/ade/client.ts`:
  - `login(credentials)` → session
  - `submitSale(payload)` → AdeResponse
  - `submitVoid(payload)` → AdeResponse
  - `getFiscalData()` → CedentePrestatore
  - `getDocument(idtrx)` → DocumentDetail
  - `downloadPdf(idtrx)` → Buffer
  - `logout()` → void
- Mapper: `src/lib/ade/mapper.ts`
  - `mapSaleToAdePayload(sale, fiscalData)` → AdE JSON (sez. 9 api-spec.md)
  - `mapVoidToAdePayload(void, fiscalData)` → AdE JSON
  - `toAdeAmount(n)` → stringa 2 decimali
  - `toAdeDate(iso)` → `dd/MM/yyyy`
- Validazione Zod: `src/lib/ade/validation.ts` (sez. 10 api-spec.md)
- TDD: test per MockAdeClient e mapper
- Implementare `MockAdeClient` in `src/lib/ade/mock-client.ts`
- Factory `createAdeClient(mode)` in `src/lib/ade/index.ts` controllata da `ADE_MODE`
- **Test attesi:** 20-25 test (mapper, validazione, mock client, factory)
- **Risultato:** 67 test (13 cookie-jar + 22 mapper + 19 validation + 13 mock-client)

**2C: RealAdeClient proof of concept (5-10 giorni) ✅**

- Implementare `RealAdeClient` in `src/lib/ade/real-client.ts`
- Flusso auth Fisconline 6 fasi (sez. 1 api-spec.md):
  1. GET `/portale/web/guest` — init cookie jar
  2. POST `/portale/home?..._58_struts_action=...` — login (CF + pwd + PIN)
  3. GET `/dp/api` — bootstrap
  4. POST `/portale/scelta-utenza-lavoro?p_auth={token}` — seleziona P.IVA
  5. GET `/ser/api/fatture/v1/ul/me/adesione/stato/` — ready probe
  6. POST `/ser/api/documenti/v1/doc/documenti/` — invio
- Gestire cookie jar, estrazione `p_auth` Liferay, redirect 302, login ok/fail
- Headers necessari (sez. 2.4 api-spec.md)
- Logout multi-step (sez. 1.6 api-spec.md)
- **Test attesi:** 10-15 test (mock HTTP con `vi.mock`)
- **Risultato:** 25 test (auth flow, submit, void, logout, error handling)

**Decisione GO/NO-GO:** Se funziona, si prosegue. Se no, fallback su DataCash/Effatta API.

---

### REVIEW CHECKPOINT 1 ✅

- ✅ Integrazione AdE documentata e validata (direct HTTP, no fallback necessario)
- ✅ Interface `AdeClient` definita e testata (6 metodi)
- ✅ MockAdeClient funzionante con test completi (13 test)
- ✅ RealAdeClient con 6-phase auth flow (25 test)
- ✅ Coverage del modulo `ade/`: 92 test totali

---

### Phase 1B: Completare landing page (3-5 giorni) — parzialmente ✅

**Obiettivo:** Landing live su scontrinozero.it con tutti i requisiti legali e SEO.

**Task completati:**

1. ✅ Privacy Policy — `src/app/(marketing)/privacy/page.tsx`
2. ✅ Termini di Servizio — `src/app/(marketing)/termini/page.tsx`
3. ✅ Sitemap — `src/app/sitemap.ts` (3 test)
4. ✅ robots.txt — `src/app/robots.ts` (2 test)
5. ✅ Pricing → teaser beta con 3 piani
6. ✅ E2E test landing aggiornati

**Task rimandati (richiedono servizi esterni):**

- ⬜ JSON-LD structured data — schema `SoftwareApplication` + `Organization`
- ⬜ Email conferma waitlist — Resend + template React Email
- ⬜ Setup Umami analytics su VPS
- ⬜ Deploy produzione `scontrinozero.it` (tag `v0.1.0`)

---

### Phase 3A: Fondamenta sicurezza (5-7 giorni) ✅

**Rationale:** La Phase 3B e 4 gestiranno credenziali Fisconline. L'infrastruttura di sicurezza DEVE essere in piedi PRIMA di scrivere codice che tocca credenziali.

1. ✅ **Sentry** — `@sentry/nextjs` v10, error tracking + performance, tunnelRoute `/monitoring`
2. ✅ **Logging strutturato** — `pino`, logger in `src/lib/logger.ts`, redazione campi sensibili
3. ✅ **Rate limiting** — `src/lib/rate-limit.ts`, in-memory con TTL, fixed window per key
4. ✅ **Modulo encryption** — `src/lib/crypto.ts`, AES-256-GCM con `node:crypto`, supporto rotazione chiavi

**Test attesi:** ~20 test (crypto roundtrip, tamper detection, rate limit, logger)
**Risultato:** 23 test (9 crypto + 7 rate-limit + 7 logger)

---

### Phase 3B: Autenticazione e onboarding ✅

1. ✅ Supabase Auth — `@supabase/ssr`, client helpers in `src/lib/supabase/` (server, browser, middleware)
2. ✅ Route group `(auth)` — login, register, reset-password, verify-email, callback
3. ✅ Middleware Next.js — protezione `/dashboard/*`, `/onboarding/*`, redirect auth-only
4. ✅ Onboarding wizard 3-step — dati attivita, credenziali Fisconline (cifrate AES-256-GCM), verifica AdE
5. ✅ Dashboard shell — layout, home, settings (profilo + attivita + stato credenziali)
6. ✅ Migrazione DB — tabella `ade_credentials` (1:1 con businesses, campi cifrati)
7. ✅ Server actions auth — signUp, signIn, signInWithMagicLink, signOut, resetPassword
8. ✅ Server actions onboarding — saveBusiness, saveAdeCredentials, verifyAdeCredentials, getOnboardingStatus
9. ✅ Sitemap aggiornata (+login, +register), robots.txt con disallow dashboard/onboarding

**Test attesi:** 15-25 unit → **Risultato:** 43 nuovi test (4 supabase + 11 middleware + 13 auth + 15 onboarding)

---

### REVIEW CHECKPOINT 2

- Auth flows funzionanti
- Credenziali cifrate at-rest (verificare nel DB)
- Rate limiting attivo
- Sentry che cattura errori
- SonarCloud verde
- Coverage auth + crypto: target 85%+

---

### Phase 4: MVP core — emissione scontrini (3-4 settimane)

**4A:** Schema DB ✅ — `commercial_documents`, `commercial_document_lines`

- `commercial_documents`: 12 col, enum `document_kind` (SALE/VOID), enum `document_status` (PENDING/ACCEPTED/VOID_ACCEPTED/REJECTED/ERROR), `idempotency_key` UNIQUE, payload AdE in jsonb, FK → businesses cascade
- `commercial_document_lines`: 8 col, numeric con precision, `ade_line_id` per annulli parziali, FK → commercial_documents cascade
- Nota: **`daily_closures` non esiste** — con Documento Commerciale Online ogni scontrino è inviato singolarmente all'AdE; non c'è chiusura giornaliera
- Migration: `supabase/migrations/0003_colossal_jimmy_woo.sql`
- Coverage: `src/db/schema/**` escluso da vitest + SonarCloud (callback lazy Drizzle non eseguibili a test-time; correttezza garantita da TypeScript + migration SQL)
- **Risultato:** 214 unit test + 8 E2E, SonarCloud quality gate verde

**4B:** UI cassa mobile-first — tastierino numerico, selezione IVA, pagamento, schermata riepilogo
**4C:** Server actions + optimistic UI — TanStack Query, mutation, rollback automatico
**4D:** Storico scontrini + dashboard — TanStack Table, filtri, totali giornalieri
**4E:** Annullamento scontrino

**Test attesi:** 40-60 unit + 3-5 E2E

---

### REVIEW CHECKPOINT 3

- Flusso completo: register → onboard → emetti → storico → annulla → chiudi
- Optimistic UI percepita come istantanea
- Skeleton loading ovunque (zero schermi bianchi)
- Mobile UX testata su telefono reale
- Coverage: target 70%+ su codice non-UI
- Lighthouse mobile: >90 landing, >80 dashboard

---

### Phase 5: PWA e distribuzione (7-10 giorni)

- Service worker con `@serwist/next`
- Manifest, install prompt
- Condivisione scontrino: QR code, email, link WhatsApp/SMS
- Ottimizzazione mobile: touch targets, viewport

**Test attesi:** 10-15 unit + 2-3 E2E

---

### Phase 6: Stabilita' e documenti legali (5-7 giorni)

- Informativa trattamento dati credenziali Fisconline
- Termini di Servizio
- Condizioni di vendita
- Suite E2E completa (tutti i flussi critici)
- Audit error handling
- Performance testing

**Test attesi:** 5-10 unit + 5-10 E2E

---

### REVIEW CHECKPOINT 4: Pre-pagamenti

- Pagine legali pubblicate
- E2E suite verde e completa
- Zero issue SonarCloud
- Sentry dashboard pulita
- Performance accettabile

---

### Phase 7: Stripe payments (10-14 giorni)

- Definire pricing finale 3 piani + free tier
- Stripe Billing: checkout, webhook, customer portal
- Feature gating middleware
- Pagina prezzi con pulsanti acquisto
- Email transazionali (conferma, rinnovo, scadenza)

**Test attesi:** 15-20 unit + 2-3 E2E

---

### Phase 8: Lancio (3-5 giorni)

- Deploy produzione finale
- Email lancio alla waitlist
- Richiedere recensioni
- Blog/guide SEO
- Documentazione self-hosting

---

## Riepilogo test cumulativi

| Fase                   | Nuovi test  | Totale cumulativo    |
| ---------------------- | ----------- | -------------------- |
| 1A (Security fix) ✅   | 23 (reali)  | 27 (23 unit + 4 E2E) |
| 2A (AdE ricerca) ✅    | 0 (ricerca) | 27                   |
| 2B-2C (AdE impl) ✅    | 92 (reali)  | 119                  |
| 1B (Landing) ✅ parz.  | 6 (reali)   | 125 unit + 8 E2E     |
| 3A (Security infra) ✅ | 23 (reali)  | 148 unit + 8 E2E     |
| 3B (Auth) ✅           | 43 (reali)  | 191 unit + 8 E2E     |
| 4A (Schema DB) ✅      | 23 (reali)  | 214 unit + 8 E2E     |
| 4B-4E (MVP)            | ~35         | ~249                 |
| 5 (PWA)                | ~13         | ~259                 |
| 6 (Stabilita')         | ~15         | ~274                 |
| 7 (Stripe)             | ~20         | ~294                 |
| **Lancio**             |             | **~295+ test**       |

---

## Review checkpoint: cosa verificare

Ad ogni checkpoint:

1. SonarCloud quality gate verde (zero nuovi bug, zero vulnerabilita')
2. Coverage in crescita rispetto al checkpoint precedente
3. Breve summary nella PR o nel ROADMAP.md
4. Valutare se serve refactor prima di procedere

---

## Primo passo immediato

Iniziare con **Phase 4B**: UI cassa mobile-first — tastierino numerico, selezione aliquota IVA, metodo di pagamento, schermata di riepilogo pre-emissione.
