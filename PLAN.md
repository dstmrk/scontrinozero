# ScontrinoZero — Piano di sviluppo

## Versione corrente: v0.9.0 ⬜

Il piano usa **release semantiche** (vx.y.z). La v1.0.0 è il lancio pubblico: prima di
quella data nessun cliente paga, nessuno si aspetta stabilità di produzione.

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Release pre-lancio → v1.0.0

| Versione   | Descrizione                  | Stato |
| ---------- | ---------------------------- | ----- |
| **v0.7.0** | AdE fiscal data update       | ✅    |
| **v0.8.0** | Email transazionali (Resend) | ✅    |
| **v0.8.1** | Landing completeness         | ✅    |
| **v0.9.0** | Stripe payments              | ⬜    |
| **v0.9.1** | Stabilità + E2E checkpoint   | ⬜    |
| **v1.0.0** | Lancio pubblico              | ⬜    |

---

### v0.7.0 — Dati locali nel payload AdE ✅

Usa i dati del business locale (tabella `businesses`) per costruire il `cedentePrestatore`
nei payload di emissione e annullo, eliminando la chiamata `getFiscalData()` verso AdE.

Imposta `modificati: true` / `flagIdentificativiModificati: true` per segnalare all'AdE
che i dati identificativi sono sovrascitti dal client.

La sincronizzazione dati su AdE (`dati_doc_commerciale.har`) è rimandata a post-v1.0.0
e potrebbe diventare una funzione premium.

**Task completati:**

- ✅ `buildCedenteFromBusiness()` in `mapper.ts` — mappa `businesses` → `AdeCedentePrestatore`
- ✅ `receipt-actions.ts` — fetch business locale, rimosso `getFiscalData()`
- ✅ `void-actions.ts` — fetch business locale, rimosso `getFiscalData()`
- ✅ Test: `buildCedenteFromBusiness` + fix `flagIdentificativiModificati` in mapper.test.ts
- ✅ Test: `receipt-actions.test.ts` e `void-actions.test.ts` aggiornati

**Test aggiunti:** ~8 unit → totale ~**477 unit + 8 E2E**

---

### v0.8.0 — Email transazionali (Resend) ✅

Integrazione Resend con template React Email per le email minime obbligatorie al lancio.

**Task completati:**

- ✅ Installare `resend` + `@react-email/components`
- ✅ Template `WelcomeEmail` in `src/emails/welcome.tsx`
- ✅ Template `PasswordResetEmail` in `src/emails/password-reset.tsx`
- ✅ `src/lib/email.ts` — wrapper `sendEmail(options)` con Resend SDK (istanza lazy dentro la funzione per evitare crash al build senza `RESEND_API_KEY`)
- ✅ Hook post-registrazione: welcome email fire-and-forget da `signUp` (`void sendEmail(...).catch(...)`)
- ✅ Test TDD per `sendEmail` (mock Resend SDK, 5 unit)
- ✅ Test per template email (`welcome.test.tsx` + `password-reset.test.tsx`, 6 unit)
- ✅ Variabile d'ambiente: `RESEND_API_KEY`, `FROM_EMAIL`
- ✅ Stili condivisi estratti in `src/emails/styles.ts` (fix SonarCloud duplication)
- ⚙️ **Manuale (pendente DNS):** Supabase Dashboard → Auth → SMTP Settings: configurare Resend come SMTP provider (`smtp.resend.com:465`). Questo rimuove il limite di 2 email/ora del tier gratuito Supabase e invia tutte le email auth (conferma, reset password) tramite Resend con il dominio verificato.

**Escluso da questa versione:** email con PDF scontrino al cliente → v1.3.0

**Test aggiunti:** 11 unit → totale **558 unit + 8 E2E**

---

### v0.8.1 — Landing completeness ✅

La landing deve essere pronta per convertire visitatori in clienti paganti.

**Task:**

- ✅ Hostname routing: `scontrinozero.it` → marketing, `app.scontrinozero.it` → app
  (`src/proxy.ts` + env vars `NEXT_PUBLIC_APP_HOSTNAME` / `NEXT_PUBLIC_MARKETING_HOSTNAME`)
  **Infrastruttura manuale (pendente):** aggiungere hostname `app.scontrinozero.it` al Cloudflare Tunnel;
  aggiornare Site URL e redirect URL in Supabase Dashboard.
- ✅ Aggiornare sezione pricing con i piani reali (Starter €4.99/mese · €29.99/anno — Pro €8.99/mese · €49.99/anno) e trial 30gg
- ✅ Rimuovere qualsiasi menzione "beta" o "presto disponibile" dalla landing
- ✅ CTA principale → `/register`
- ✅ JSON-LD structured data (`SoftwareApplication` + `Organization` + `FAQPage`)
- ✅ T&C rimangono v01 — creare v02 solo prima di v1.0.0 (con prezzi Stripe reali)
- ✅ Aggiornare Privacy Policy e Cookie Policy con data corrente (marzo 2026)
- ✅ Sitemap aggiornata: aggiunto permalink `/termini/v01`

**Test aggiunti:** 13 unit (JSON-LD) → totale **572 unit + 8 E2E**

---

### v0.9.0 — Stripe payments ⬜

Integrazione completa Stripe Billing per i due piani (Starter + Pro) + billing mensile e
annuale + trial 30gg + feature gating.

**Modello piani:**

| Piano       | Mensile | Annuale | Catalogo | Analytics avanzata | Export CSV | AdE sync | Supporto prioritario |
| ----------- | ------- | ------- | -------- | ------------------ | ---------- | -------- | -------------------- |
| Starter     | €4.99   | €29.99  | 5 prod.  | ❌                 | ❌         | ❌       | ❌                   |
| Pro         | €8.99   | €49.99  | ∞        | ✅                 | ✅         | ✅       | ✅                   |
| Unlimited   | —       | —       | ∞        | ✅                 | ✅         | ✅       | ✅                   |
| Self-hosted | —       | —       | ∞        | ✅                 | ✅         | ✅       | —                    |

**Trial:** 30 giorni senza carta di credito. Alla scadenza: scelta piano + CC per continuare,
altrimenti sola lettura (storico visibile, emissione bloccata).
**Anti-abuso:** P.IVA UNIQUE su `profiles` — impedisce trial multipli anche con email diverse.
**Upgrade/downgrade:** gestito da Stripe con proration automatica (`proration_behavior: 'create_prorations'`).
**Piano Unlimited:** `plan = 'unlimited'` su `profiles`, nessuna logica Stripe, gestito manualmente su DB.

**Task (TDD — test prima):**

- ⬜ Aggiungere colonna `plan` su `profiles` (`'trial' | 'starter' | 'pro' | 'unlimited'`, default `'trial'`)
  e `trial_started_at TIMESTAMPTZ`, `plan_expires_at TIMESTAMPTZ`
- ⬜ Verificare che `partita_iva` su `profiles` abbia vincolo UNIQUE (già presente da 4H; confermare migration)
- ⬜ Aggiungere tabella `subscriptions` al DB (`src/db/schema/subscriptions.ts`)
  - `id`, `userId` (FK → auth.users), `stripeCustomerId`, `stripePriceId`,
    `stripeSubscriptionId`, `status` (active/canceled/past_due/trialing), `currentPeriodEnd`,
    `interval` ('month' | 'year')
- ⬜ Migration Supabase + RLS policy
- ⬜ Installare `stripe` SDK
- ⬜ `src/lib/stripe.ts` — client Stripe + Price ID costanti (Starter mensile/annuale, Pro mensile/annuale)
- ⬜ `src/lib/plans.ts` — helper `getPlan(userId)`, `canUsePro()`, `canUseStarter()`, `isTrialExpired()`
  - `unlimited` bypassa tutti i gate come Pro
- ⬜ API route `POST /api/stripe/checkout` — crea Stripe Checkout Session con trial già usato
  (nessun trial Stripe: il trial è gestito internamente, Stripe parte da subscription attiva)
- ⬜ API route `POST /api/stripe/webhook` — gestisce eventi:
  - `checkout.session.completed` → attiva subscription, aggiorna `plan` + `plan_expires_at`
  - `invoice.paid` → rinnova `currentPeriodEnd`
  - `customer.subscription.updated` → gestisce upgrade/downgrade (proration automatica)
  - `customer.subscription.deleted` → downgrade a sola lettura
- ⬜ Feature gate catalogo: limit 5 prodotti in `addCatalogItem` server action per piano Starter/trial
- ⬜ Email reminder trial: 7 giorni prima della scadenza (template `TrialExpiringEmail`)
- ⬜ Pagina `/dashboard/abbonamento` — piano corrente + scadenza trial, scegli piano (CTA Stripe Checkout),
  upgrade/downgrade, gestione fatture (Stripe Customer Portal)
- ⬜ Variabili: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Test attesi:** ~25 unit + 1 E2E → totale ~**595 unit + 9 E2E**

---

### v0.9.1 — Stabilità + E2E checkpoint ⬜

Checkpoint obbligatorio: questa non è una feature release, ma una verifica che tutto
funzioni prima di toccare la produzione.

**Task:**

- ⬜ **Sentry integration** (`@sentry/nextjs`):
  - Installare `@sentry/nextjs`, generare `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  - Aggiungere `SENTRY_DSN` e `SENTRY_AUTH_TOKEN` a `.env.example`
  - Source maps upload nella pipeline CI (step build)
  - Verificare che un errore di test arrivi nella dashboard Sentry
- ⬜ Suite E2E completa su `test.scontrinozero.it`:
  - register → onboard → emetti scontrino (MockAdeClient) → storico → storno
  - upgrade Free → Starter (Stripe test mode)
  - reset password via Resend
- ⬜ Lighthouse audit: landing ≥90 mobile, dashboard ≥80 mobile
- ⬜ Security audit: portare CI a `--audit-level=moderate` con `audit-ci` + allowlist
  documentata per le eccezioni approvate (es. esbuild in drizzle-kit devDependency)
- ⬜ Secret scanning in CI: aggiungere **Gitleaks** come step CI per bloccare commit
  con credenziali o chiavi accidentalmente committate
- ⬜ Docker image scan: aggiungere **Trivy** nella pipeline deploy per scansionare
  l'immagine Docker prima del push su GHCR
- ⬜ GDPR art. 20 — Portabilità dati: pulsante "Esporta dati" in `/dashboard/settings`
  che genera un JSON scaricabile con tutti i dati dell'utente (profilo, attività,
  scontrini). Obbligo legale prima del lancio pubblico.
- ⬜ SonarCloud quality gate verde, zero issue Blocker/Critical
- ⬜ Smoke test su ambiente test con `ADE_MODE=mock`
- ⬜ Verificare che tutte le variabili d'ambiente `.env.example` siano aggiornate
- ⬜ Aggiornare Privacy Policy/ToS se necessario dopo test legale

**Test attesi:** ~5 unit (export dati) + ~10 E2E → totale ~**519 unit + 19 E2E**

---

### v1.0.0 — Lancio pubblico ⬜

**Non è una release di sviluppo.** È il tag push che promuove il codice di v0.9.1 in
produzione. Zero nuovi sviluppi — solo validazione finale.

**Checklist pre-tag:**

- ⬜ `package.json` version → `1.0.0`
- ⬜ Rimuovere qualsiasi badge/label "beta" rimasto
- ⬜ Deploy su `scontrinozero.it` via tag `v1.0.0`
- ⬜ Verificare Stripe live mode (chiavi `sk_live_*`)
- ⬜ Verificare Resend produzione
- ⬜ Verificare `ADE_MODE=real` in produzione
- ⬜ Sentry produzione che riceve eventi
- ⬜ Email lancio alla waitlist
- ⬜ Richiedere prime recensioni

---

## Definizione v1.0.0: incluso / escluso

### IN v1.0.0

- Emissione scontrino via `RealAdeClient` (Fisconline)
- Auth: email/password + SPID
- Onboarding wizard 3-step completo
- Storico + storno + PDF + share link pubblico
- Catalogo prodotti locale (CRUD)
- Settings (dati business, credenziali AdE, sync AdE, piano corrente)
- Stripe: Starter + Pro (billing mensile e annuale)
- Trial 30gg senza CC, sola lettura alla scadenza senza piano
- Feature gate per piano (catalogo 5 prod. Starter, analytics/export/AdE sync Pro)
- Welcome email + password reset email (Resend)
- Landing con prezzi reali, senza "beta"
- Privacy Policy, ToS, Cookie Policy aggiornate
- Deploy Docker via tag `v1.0.0`

### FUORI da v1.0.0 (vedi release post-lancio)

| Feature                                                                                    | Versione |
| ------------------------------------------------------------------------------------------ | -------- |
| PWA (installabile, offline shell)                                                          | v1.1.0   |
| Coupon/promo codes, referral program                                                       | v1.2.0   |
| Email scontrino al cliente                                                                 | v1.3.0   |
| Dashboard analytics (grafici)                                                              | v1.4.0   |
| AdE catalog sync                                                                           | v1.5.0   |
| AdE auth multi-metodo: SPID + CIE (onboarding + settings)                                  | v1.6.0   |
| CSV import prodotti + barcode                                                              | v1.7.0   |
| Bluetooth print, Passkey                                                                   | v1.8.0+  |
| Scontrino annullamento: salvare progressivo AdE annullo + stampa documento di annullamento | v1.9.0   |
| API pubblica, multi-operatore                                                              | v2.0.0+  |

---

## Release post-lancio (v1.x.y)

| Versione    | Descrizione                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| **v1.1.0**  | PWA: `@serwist/next`, manifest, offline shell, install prompt                                                       |
| **v1.2.0**  | Coupon/promo codes, referral program, Stripe Customer Portal polish                                                 |
| **v1.3.0**  | Email scontrino al cliente (PDF allegato via Resend)                                                                |
| **v1.4.0**  | Dashboard analytics: totale giornaliero, sparkline revenue, export CSV                                              |
| **v1.5.0**  | Catalogo: modifica prodotto + sync AdE (HAR: aggiungi/modifica/elimina)                                             |
| **v1.6.0**  | AdE auth multi-metodo: SPID e CIE selezionabili in onboarding + settings; cookie jar cifrato nel DB, re-auth on 401 |
| **v1.7.0**  | CSV import prodotti, barcode scanner (BarcodeDetector API), Umami analytics                                         |
| **v1.8.0+** | Bluetooth printing (58/80mm), Passkey, codice lotteria                                                              |
| **v1.9.0**  | Storno avanzato: memorizzare progressivo documento AdE di annullamento e stampare ricevuta di annullamento          |
| **v2.0.0+** | API pubblica, webhook, multi-operatore, integrazione e-commerce                                                     |

---

### v1.9.0 — Scontrino di annullamento (post-lancio) ⬜

Quando annulliamo uno scontrino, AdE genera un nuovo documento commerciale di annullamento.

**Task (TDD — test prima):**

- ⬜ Persistire nel DB il numero/progressivo del documento commerciale di annullamento restituito da AdE
- ⬜ Estendere `voidReceipt`/storico per esporre il riferimento del documento di annullamento
- ⬜ Aggiungere stampa/anteprima "scontrino di annullamento" dedicato
- ⬜ Includere nel layout testo di riferimento, es.:
  - `DOCUMENTO COMMERCIALE emesso per ANNULLAMENTO`
  - `Documento di riferimento: N. 0005-0009 del 03-06-2020`
- ⬜ Test TDD per mapping payload AdE, persistenza e rendering documento

---

## Storico sviluppo (fasi completate)

| Fase                           | Stato | Test al completamento     | Note                                                                                     |
| ------------------------------ | ----- | ------------------------- | ---------------------------------------------------------------------------------------- |
| 0 — Fondamenta                 | ✅    | —                         | Next.js 16, shadcn/ui, CI/CD, Supabase, Drizzle                                          |
| 1A — Security fix + TDD        | ✅    | 23 unit                   | `isValidEmail`, waitlist API, SonarCloud verde                                           |
| 2 — Integrazione AdE           | ✅    | 92 unit (55 AdE dedicati) | MockAdeClient + RealAdeClient, 6-phase Fisconline                                        |
| 1B — Landing page              | ✅    | 6 unit + 8 E2E            | Privacy ✅, ToS ✅, Sitemap ✅                                                           |
| 3A — Fondamenta sicurezza      | ✅    | 148 unit + 8 E2E          | pino, rate limiting, AES-256-GCM (Sentry rimandato a v0.9.1)                            |
| 3B — Auth + onboarding         | ✅    | 191 unit + 8 E2E          | Supabase Auth, wizard 3-step, credenziali cifrate                                        |
| 4A — Schema DB scontrini       | ✅    | 214 unit + 8 E2E          | `commercial_documents` + `commercial_document_lines`                                     |
| 4B — UI cassa mobile-first     | ✅    | 305 unit + 8 E2E          | Tastierino, IVA, metodo pagamento, riepilogo                                             |
| 4C — Server actions + UI       | ✅    | 319 unit + 8 E2E          | `emitReceipt`, TanStack Query, optimistic updates                                        |
| 4D — Storico + storno + PDF    | ✅    | 422 unit + 8 E2E          | PDF pdfkit 58mm, share link pubblico, HTML receipt                                       |
| 4F — UI polish + registrazione | ✅    | 370→422 unit + 8 E2E      | `isStrongPassword`, paginazione storico, UX fixes                                        |
| 4G — Catalogo + nav mobile     | ✅    | 464 unit + 8 E2E          | `catalog_items`, CRUD, bottom-nav, tap→cassa                                             |
| 4H — Onboarding refactor       | ✅    | 469 unit + 8 E2E          | firstName/lastName, P.IVA da AdE, CAP, migration                                         |
| 4J — SPID login                | ✅    | 502 unit + 8 E2E          | SAML2 HTTP POST, push 2FA polling, MockAdeClient.loginSpid()                             |
| 4K — Security hardening        | ✅    | ~511 unit + 8 E2E         | CORS, RLS, npm audit CI, rate limiting, audit log, account deletion                      |
| 4L — Terms acceptance tracking | ✅    | ~512 unit + 8 E2E         | `terms_accepted_at` + `terms_version` su `profiles`; `/termini/v01` permalink + redirect |
| v0.7.0 — AdE fiscal data       | ✅    | ~521 unit + 8 E2E         | `buildCedenteFromBusiness()`, rimosso `getFiscalData()`, `modificati: true` nel payload  |
| v0.8.0 — Email (Resend)        | ✅    | 558 unit + 8 E2E          | `sendEmail()`, WelcomeEmail, PasswordResetEmail, stili condivisi, hook post-signUp       |
| v0.8.1 — Landing completeness  | ✅    | 572 unit + 8 E2E          | Prezzi reali, rimozione beta, JSON-LD, sitemap `/termini/v01`, date marzo 2026           |

---

## Riepilogo test cumulativi

| Versione   | Nuovi test (stimati) | Totale unit | Totale E2E |
| ---------- | -------------------- | ----------- | ---------- |
| (storico)  | —                    | 502         | 8          |
| **4K**     | ~9                   | ~511        | 8          |
| **4L**     | ~1                   | ~512        | 8          |
| **v0.7.0** | ~9                   | ~521        | 8          |
| **v0.8.0** | 37                   | **558**     | 8          |
| **v0.8.1** | 13                   | **572**     | 8          |
| **v0.9.0** | ~25                  | ~595        | 8          |
| **v0.9.1** | ~0 unit / ~10 E2E    | ~590        | ~18        |
| **v1.0.0** | 0 (solo tag)         | ~590        | ~18        |

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **v0.9.1 è un checkpoint**, non una feature release. Niente di nuovo finché non è verde.
4. **v1.0.0 è solo un tag push**: se c'è ancora sviluppo da fare, siamo a v0.9.x.
5. **Stripe prima di PWA**: meglio pochi utenti paganti che tanti utenti gratuiti non monetizzati.
