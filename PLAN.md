# ScontrinoZero — Piano di sviluppo

## Contesto

Phase 0 e Phase 1A completate. Il progetto ha 23 unit test + 4 E2E test.
L'analisi del portale AdE (Phase 2A) e' completata con specifica completa in `docs/api-spec.md`.
Prossimo step: implementazione del modulo AdE (Phase 2B/2C).

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

**2B: Interface design + MockAdeClient (3-5 giorni)** 🔵

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

**2C: RealAdeClient proof of concept (5-10 giorni)**

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

**Decisione GO/NO-GO:** Se funziona, si prosegue. Se no, fallback su DataCash/Effatta API.

---

### REVIEW CHECKPOINT 1

- Integrazione AdE documentata e validata (o fallback scelto)
- Interface `AdeClient` definita e testata
- MockAdeClient funzionante con test completi
- Coverage del modulo `ade/`: target 90%+

---

### Phase 1B: Completare landing page (3-5 giorni)

**Obiettivo:** Landing live su scontrinozero.it con tutti i requisiti legali e SEO.

**Task in ordine:**

1. Privacy Policy — pagina statica in `src/app/(marketing)/privacy/page.tsx`
2. Sitemap — `next-sitemap` + config
3. JSON-LD structured data — schema `SoftwareApplication` + `Organization`
4. Email conferma waitlist — Resend + template React Email in `src/emails/`
5. Setup Umami analytics su VPS
6. Deploy produzione `scontrinozero.it` (tag `v0.1.0`)

**Test attesi:** 5-8 unit test (email), 1-2 E2E (navigazione pagine legali)

---

### Phase 3A: Fondamenta sicurezza (5-7 giorni)

**Rationale:** La Phase 3B e 4 gestiranno credenziali Fisconline. L'infrastruttura di sicurezza DEVE essere in piedi PRIMA di scrivere codice che tocca credenziali.

1. **Sentry** — `@sentry/nextjs`, error tracking + performance
2. **Logging strutturato** — `pino`, logger in `src/lib/logger.ts`
3. **Rate limiting** — `src/lib/rate-limit.ts`, in-memory con TTL (no dipendenze esterne)
4. **Modulo encryption** — `src/lib/crypto.ts`, AES-256-GCM con Node.js `crypto` nativo, supporto rotazione chiavi

**Test attesi:** ~20 test (crypto roundtrip, tamper detection, rate limit, logger)

---

### Phase 3B: Autenticazione e onboarding (10-14 giorni)

1. Supabase Auth — `@supabase/ssr`, client helpers in `src/lib/supabase/`
2. Route group `(auth)` — login, register, reset-password, verify-email
3. Middleware Next.js — protezione `/dashboard/*`
4. Onboarding wizard — dati attivita', credenziali Fisconline (cifrate), verifica AdE
5. Profilo/impostazioni utente
6. Migrazione DB — tabella `ade_credentials`

**Test attesi:** 15-25 unit + 3-5 E2E

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

**4A:** Schema DB — `commercial_documents`, `commercial_document_lines`, `daily_closures` (nomi da sez. 11 api-spec.md)
**4B:** UI cassa mobile-first — tastierino, IVA, pagamento, riepilogo
**4C:** Server actions + optimistic UI — TanStack Query, mutation, rollback
**4D:** Storico scontrini + dashboard — TanStack Table, filtri, totali
**4E:** Annullamento + chiusura giornaliera

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

| Fase                 | Nuovi test  | Totale cumulativo    |
| -------------------- | ----------- | -------------------- |
| 1A (Security fix) ✅ | 23 (reali)  | 27 (23 unit + 4 E2E) |
| 2A (AdE ricerca) ✅  | 0 (ricerca) | 27                   |
| 2B-2C (AdE impl)     | ~30-40      | ~60-67               |
| 1B (Landing)         | ~8          | ~68-75               |
| 3A (Security infra)  | ~20         | ~88-95               |
| 3B (Auth)            | ~25         | ~113-120             |
| 4 (MVP)              | ~55         | ~168-175             |
| 5 (PWA)              | ~13         | ~181-188             |
| 6 (Stabilita')       | ~15         | ~196-203             |
| 7 (Stripe)           | ~20         | ~216-223             |
| **Lancio**           |             | **~220+ test**       |

---

## Review checkpoint: cosa verificare

Ad ogni checkpoint:

1. SonarCloud quality gate verde (zero nuovi bug, zero vulnerabilita')
2. Coverage in crescita rispetto al checkpoint precedente
3. Breve summary nella PR o nel ROADMAP.md
4. Valutare se serve refactor prima di procedere

---

## Primo passo immediato

Iniziare con **Phase 2B**: definire tipi TypeScript, interfaccia `AdeClient`, mapper, validazione Zod, `MockAdeClient` — tutto in TDD con riferimento a `docs/api-spec.md`.
