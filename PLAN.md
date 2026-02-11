# ScontrinoZero — Piano di ristrutturazione roadmap

## Contesto

La Phase 0 e' completa e la landing page e' live. Il progetto ha due problemi:

1. Un security hotspot su SonarCloud (regex DoS nel waitlist endpoint)
2. Coverage di test quasi inesistente (3 unit test + 4 E2E)

L'utente vuole attivita' sequenziali chiare, test adeguati per ogni fase, e checkpoint di review periodici.

---

## Sequenza proposta

### Phase 1A: Fix security + stabilire pattern di test (1 giorno)

**Obiettivo:** Risolvere l'hotspot SonarCloud e stabilire il pattern TDD per tutto il progetto.

**Approccio al fix:** Sostituire la regex vulnerabile con una validazione a tempo lineare (no backtracking):

- Creare `src/lib/validation.ts` con funzione `isValidEmail()` che usa controlli stringa (indexOf, includes) invece di regex
- Aggiungere check lunghezza max 254 caratteri (RFC 5321) come prima difesa
- La vera validazione email avverra' quando Resend inviera' la conferma

**File da modificare/creare:**

- `src/lib/validation.ts` — nuova funzione di validazione
- `src/lib/validation.test.ts` — test TDD (scritti prima dell'implementazione)
- `src/app/api/waitlist/route.ts` — usare la nuova funzione
- `src/app/api/waitlist/route.test.ts` — test dell'endpoint (mock Drizzle)

**Test attesi:** ~15 nuovi test (8-10 validazione email + 5-7 endpoint API)

**Verifica:** SonarCloud quality gate verde, hotspot risolto.

---

### Phase 2: Spike integrazione AdE (2-3 settimane)

**Obiettivo:** Validare la fattibilita' dell'integrazione diretta con il portale F&C. Questa e' l'attivita' a rischio piu' alto — va fatta il prima possibile.

**2A: Ricerca e documentazione (5-7 giorni)**

- Accedere al portale F&C con credenziali Fisconline
- Analizzare il flusso HTTP con DevTools (Network tab)
- Documentare ogni chiamata in `src/lib/ade/README.md`
- Tentare di replicare una singola chiamata con curl/fetch
- Nessun test (e' pura ricerca)

**2B: Interface design + MockAdeClient (3-5 giorni)**

- Definire tipi in `src/lib/ade/types.ts`
- Definire interfaccia `AdeClient` in `src/lib/ade/client.ts`
- TDD: scrivere test per `MockAdeClient` prima dell'implementazione
- Implementare `MockAdeClient` in `src/lib/ade/mock-client.ts`
- Factory function controllata da `ADE_MODE` in `src/lib/ade/index.ts`
- **Test attesi:** 15-20 test (auth, emissione, chiusura, errori, sessione)

**2C: RealAdeClient proof of concept (5-10 giorni)**

- Implementare `RealAdeClient` in `src/lib/ade/real-client.ts`
- Replicare flusso auth + emissione via HTTP
- Gestire cookies, CSRF, redirect
- **Test attesi:** 10-15 test (mock HTTP con `msw` o `vi.mock`)

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

**4A:** Schema DB — `receipts`, `receipt_items`, `daily_closures`
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

| Fase                | Nuovi test | Totale cumulativo |
| ------------------- | ---------- | ----------------- |
| 1A (Security fix)   | ~15        | ~20               |
| 2B-2C (AdE)         | ~30        | ~50               |
| 1B (Landing)        | ~8         | ~58               |
| 3A (Security infra) | ~20        | ~78               |
| 3B (Auth)           | ~25        | ~103              |
| 4 (MVP)             | ~55        | ~158              |
| 5 (PWA)             | ~13        | ~171              |
| 6 (Stabilita')      | ~15        | ~186              |
| 7 (Stripe)          | ~20        | ~206              |
| **Lancio**          |            | **~200+ test**    |

---

## Review checkpoint: cosa verificare

Ad ogni checkpoint:

1. SonarCloud quality gate verde (zero nuovi bug, zero vulnerabilita')
2. Coverage in crescita rispetto al checkpoint precedente
3. Breve summary nella PR o nel ROADMAP.md
4. Valutare se serve refactor prima di procedere

---

## Primo passo immediato

Iniziare con **Phase 1A**: fix regex DoS + test TDD per waitlist endpoint.
