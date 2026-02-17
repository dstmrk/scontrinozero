# ScontrinoZero — Roadmap di sviluppo

Legenda: ⬜ Todo · 🔵 In progress · ✅ Done

Piano dettagliato con test e review checkpoint: vedi [`PLAN.md`](./PLAN.md)

---

## Fase 0 — Fondamenta progetto ✅

- ✅ Next.js 16 (App Router, TypeScript strict, Tailwind CSS 4)
- ✅ shadcn/ui (radix-nova, teal theme, Nunito Sans, Lucide)
- ✅ ESLint + Prettier + husky + lint-staged
- ✅ Vitest + coverage + vitest-sonar-reporter
- ✅ Playwright (E2E)
- ✅ SonarQube Cloud config
- ✅ Dockerfile + docker-compose + .env.example
- ✅ GitHub Actions CI + Deploy (tag-based)
- ✅ Dependabot
- ✅ Supabase Cloud (test project)
- ✅ Drizzle ORM + migrazioni (profiles, businesses, waitlist)
- ✅ Health check `/api/health`
- ✅ Primo deploy test su VPS (Cloudflare Tunnel)

---

## Fase 1A — Fix security + pattern TDD ✅

- ✅ Fix regex DoS in waitlist endpoint (SonarCloud hotspot)
- ✅ `src/lib/validation.ts` con validazione email a tempo lineare
- ✅ Test TDD per validazione (13) + endpoint waitlist (7) + utils (3)
- ✅ SonarCloud issues risolte (readonly props, deprecated icons/types, CSS)
- **Risultato:** 23 unit test, SonarCloud quality gate verde

---

## Fase 1 — Landing page + waitlist (parziale ✅)

- ✅ Landing page mobile-first (hero, problema, soluzione, come funziona, pricing, CTA)
- ✅ Route group `(marketing)` con layout dedicato
- ✅ Sezione `#prezzi` — 3 piani (Free, Starter, Pro)
- ✅ Sezione `#funzionalita` — 6 benefit card
- ✅ Waitlist: input email + submit (API + Supabase)
- ✅ SEO: metadata, Open Graph, title template
- ⬜ Email conferma iscrizione (Resend)
- ⬜ Sitemap (`next-sitemap`)
- ⬜ JSON-LD structured data
- ⬜ Setup Umami analytics (self-hosted su VPS)
- ⬜ Privacy Policy + Cookie Policy
- ⬜ Deploy su `scontrinozero.it`

---

## Fase 2 — Spike integrazione AdE 🔵

**Rischio più alto del progetto — va prima della Fase 1B.**

### 2A: Ricerca e documentazione ✅

- ✅ Analizzati 17 file HAR (login, vendita, annullo, ricerca, rubrica, logout, full flow)
- ✅ Analizzato codice C# di riferimento (Send.cs, DC.cs, Esiti.cs)
- ✅ Creata specifica completa `docs/api-spec.md`
- ✅ Flusso auth Fisconline mappato in 6 fasi

### 2B: Interface design + MockAdeClient ✅

- ✅ Definiti tipi in `src/lib/ade/types.ts` + `public-types.ts`
- ✅ Definita interfaccia `AdeClient` in `src/lib/ade/client.ts`
- ✅ Mapper `src/lib/ade/mapper.ts` (sale/void → AdE payload) — 22 test
- ✅ Validazione Zod `src/lib/ade/validation.ts` — 19 test
- ✅ TDD: test → implementato `MockAdeClient` — 13 test
- ✅ Factory function controllata da `ADE_MODE`
- ✅ Cookie jar per gestione sessione — 13 test

### 2C: RealAdeClient proof of concept ✅

- ✅ Implementato `RealAdeClient` con flusso auth 6 fasi + emissione via HTTP
- ✅ Gestione cookie jar, p_auth Liferay, redirect 302
- ✅ **Decisione GO/NO-GO: GO** — integrazione diretta validata
- ✅ 25 test (auth flow, submit, void, logout, error handling)

### 📋 REVIEW CHECKPOINT 1 ✅

- [x] AdE integration validata (direct HTTP, no fallback necessario)
- [x] `AdeClient` interface definita e testata (6 metodi)
- [x] Coverage modulo `ade/`: 92 test totali

---

## Fase 1B — Completare landing page ⬜

(Dopo la validazione AdE)

- ⬜ Privacy Policy
- ⬜ Sitemap + JSON-LD
- ⬜ Email conferma waitlist (Resend)
- ⬜ Umami analytics
- ⬜ Deploy produzione `scontrinozero.it` (tag `v0.1.0`)

---

## Fase 3A — Fondamenta sicurezza ✅

- ✅ Sentry (`@sentry/nextjs` v10) — error tracking + performance, tunnelRoute `/monitoring`
- ✅ Logging strutturato (`pino`) — redazione campi sensibili, child logger per request
- ✅ Rate limiting (`src/lib/rate-limit.ts`) — in-memory, fixed window per key
- ✅ Modulo encryption AES-256-GCM (`src/lib/crypto.ts`) — supporto rotazione chiavi

---

## Fase 3B — Autenticazione e onboarding 🔵

- ✅ Supabase Auth (`@supabase/ssr`) — email/password + magic link
- ✅ Route group `(auth)`: login, register, reset-password, verify-email, callback
- ✅ Middleware Next.js per proteggere `/dashboard/*` e `/onboarding/*`
- ✅ Onboarding wizard 3-step: dati attivita, credenziali Fisconline (cifrate AES-256-GCM), verifica AdE
- ✅ Dashboard shell con layout, home, settings (profilo + attivita + stato credenziali)
- ✅ Migrazione DB: tabella `ade_credentials` (1:1 con businesses)
- ✅ Server actions: auth (signUp/signIn/signOut/resetPassword) + onboarding (saveBusiness/saveAdeCredentials/verifyAdeCredentials)
- **Risultato:** 43 nuovi test, totale 191 unit + 8 E2E

### 📋 REVIEW CHECKPOINT 2 ✅

- [x] Auth flows funzionanti (signUp, signIn, magicLink, signOut, resetPassword)
- [x] Credenziali cifrate at-rest (AES-256-GCM con key rotation)
- [x] Rate limiting attivo su tutti gli endpoint auth
- [x] Sentry attivo per error tracking
- [x] 191 unit test verdi, build OK

---

## Fase 4 — MVP core: emissione scontrini ⬜

- ⬜ Schema DB: `commercial_documents`, `commercial_document_lines`, `daily_closures`
- ⬜ UI cassa mobile-first (tastierino, IVA, pagamento, riepilogo)
- ⬜ Server actions + optimistic UI (TanStack Query)
- ⬜ Storico scontrini (TanStack Table, filtri, dettaglio)
- ⬜ Annullamento + reso
- ⬜ Chiusura giornaliera (automatica/manuale)
- ⬜ Dashboard base: totale giornaliero, conteggio
- ⬜ Codice lotteria scontrini

### 📋 REVIEW CHECKPOINT 3

- [ ] Flusso completo: register → onboard → emetti → storico → annulla → chiudi
- [ ] Optimistic UI istantanea, skeleton loading ovunque
- [ ] Mobile UX su telefono reale
- [ ] Coverage: target 70%+ su codice non-UI
- [ ] Lighthouse: >90 landing, >80 dashboard

---

## Fase 5 — PWA e distribuzione ⬜

- ⬜ Service worker (`@serwist/next`), manifest, install prompt
- ⬜ Condivisione scontrino: QR code, email, link WhatsApp/SMS
- ⬜ Ottimizzazione mobile: touch targets, viewport

---

## Fase 6 — Stabilità e documenti legali ⬜

- ⬜ Informativa trattamento dati credenziali Fisconline
- ⬜ Termini di Servizio + Condizioni di vendita
- ⬜ Suite E2E completa (flussi critici)
- ⬜ Audit error handling + performance testing

### 📋 REVIEW CHECKPOINT 4

- [ ] Pagine legali pubblicate
- [ ] E2E suite completa e verde
- [ ] Zero issue SonarCloud
- [ ] Performance accettabile

---

## Fase 7 — Stripe payments ⬜

- ⬜ Pricing finale 3 piani + free tier
- ⬜ Stripe Billing: checkout, webhook, customer portal
- ⬜ Feature gating middleware
- ⬜ Email transazionali (conferma, rinnovo, scadenza)

---

## Fase 8 — Lancio ⬜

- ⬜ Deploy produzione finale
- ⬜ Email lancio alla waitlist
- ⬜ Richiedere recensioni
- ⬜ Blog/guide SEO
- ⬜ Documentazione self-hosting

---

## Backlog — Feature future (post-lancio)

- ⬜ Catalogo prodotti/servizi
- ⬜ Import CSV/XLS prodotti
- ⬜ Scanner barcode via fotocamera
- ⬜ Stampa Bluetooth (58/80mm)
- ⬜ Integrazione POS: SumUp, Nexi, Satispay
- ⬜ Fatturazione elettronica (SDI)
- ⬜ Dashboard avanzata: grafici, trend, export
- ⬜ Multi-operatore: ruoli, log attività
- ⬜ Integrazione e-commerce (WooCommerce, Shopify)
- ⬜ Blog MDX per SEO organico
- ⬜ Notifiche push (PWA)
- ⬜ Modalità offline con coda di sincronizzazione
- ⬜ API pubblica / webhook
- ⬜ App Capacitor (feature native)

---

## Note

- **Approccio TDD**: ogni task inizia scrivendo i test
- **Performance percepita priorità #1**: optimistic UI, skeleton loading, stale-while-revalidate
- **Fase 2 bloccante**: se l'integrazione AdE diretta fallisce, fallback su API terze parti
- **Sicurezza prima delle credenziali**: Fase 3A (Sentry, encryption, rate limiting) precede la Fase 3B (auth + credenziali)
- **Review checkpoint** dopo ogni fase critica — vedi PLAN.md per dettagli
- **Target test al lancio**: ~200+ test (unit + integration + E2E)
