# ScontrinoZero — Piano di sviluppo

## Versione corrente: v0.7.0 ⬜

Il piano usa **release semantiche** (vx.y.z). La v1.0.0 è il lancio pubblico: prima di
quella data nessun cliente paga, nessuno si aspetta stabilità di produzione.

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Release pre-lancio → v1.0.0

| Versione    | Descrizione                 | Stato |
| ----------- | --------------------------- | ----- |
| **v0.7.0**  | AdE fiscal data update      | ⬜    |
| **v0.8.0**  | Email transazionali (Resend)| ⬜    |
| **v0.8.1**  | Landing completeness        | ⬜    |
| **v0.9.0**  | Stripe payments             | ⬜    |
| **v0.9.1**  | Stabilità + E2E checkpoint  | ⬜    |
| **v1.0.0**  | Lancio pubblico             | ⬜    |

---

### v0.7.0 — AdE fiscal data update ⬜

Aggiornamento dati cedente sul portale AdE dopo l'onboarding (indirizzo, nome attività).
Dipende dall'analisi di `dati_doc_commerciale.har`.

**Task (TDD — test prima):**

- ⬜ Analizzare `dati_doc_commerciale.har` → mappare endpoint + payload
- ⬜ Aggiungere `updateFiscalData(data)` all'interfaccia `AdeClient` (`src/lib/ade/client.ts`)
- ⬜ Implementare in `MockAdeClient` + `RealAdeClient`
- ⬜ Server action `syncFiscalData` in `src/server/onboarding-actions.ts`
- ⬜ Bottone "Sincronizza dati su AdE" in Settings (`src/app/dashboard/settings/page.tsx`)
- ⬜ Test TDD: ~10 nuovi unit test

**Test attesi:** ~10 unit → totale ~**479 unit + 8 E2E**

---

### v0.8.0 — Email transazionali (Resend) ⬜

Integrazione Resend con template React Email per le email minime obbligatorie al lancio.

**Task (TDD — test prima):**

- ⬜ Installare `resend` + `@react-email/components`
- ⬜ Template `WelcomeEmail` in `src/emails/welcome.tsx`
- ⬜ Template `PasswordResetEmail` in `src/emails/password-reset.tsx`
- ⬜ `src/lib/email.ts` — wrapper `sendEmail(to, template)` con Resend SDK
- ⬜ Hook post-registrazione: inviare welcome email da `signUp` server action
- ⬜ Override email password reset Supabase: usare Resend al posto del template Supabase default
- ⬜ Test TDD per `sendEmail` (mock Resend SDK)
- ⬜ Variabile d'ambiente: `RESEND_API_KEY`, `FROM_EMAIL`

**Escluso da questa versione:** email con PDF scontrino al cliente → v1.3.0

**Test attesi:** ~10 unit → totale ~**489 unit + 8 E2E**

---

### v0.8.1 — Landing completeness ⬜

La landing deve essere pronta per convertire visitatori in clienti paganti.

**Task:**

- ⬜ Aggiornare sezione pricing con i piani reali (Free / Starter / Pro) e i prezzi definitivi
- ⬜ Rimuovere qualsiasi menzione "beta" o "presto disponibile" dalla landing
- ⬜ CTA principale → `/register` (non più waitlist)
- ⬜ JSON-LD structured data (`SoftwareApplication` + `Organization`)
- ⬜ Aggiornare Privacy Policy, ToS e Cookie Policy con prezzi Stripe reali e data corrente
- ⬜ Verificare che la sitemap includa tutte le pagine marketing

**Test attesi:** ~5 unit (JSON-LD, sitemap) → totale ~**494 unit + 8 E2E**

---

### v0.9.0 — Stripe payments ⬜

Integrazione completa Stripe Billing per i tre piani + feature gating.

**Task (TDD — test prima):**

- ⬜ Aggiungere tabella `subscriptions` al DB (`src/db/schema/subscriptions.ts`)
  - `id`, `userId` (FK → auth.users), `stripeCustomerId`, `stripePriceId`,
    `stripeSubscriptionId`, `status` (active/canceled/past_due/trialing), `currentPeriodEnd`
- ⬜ Migration Supabase + RLS policy
- ⬜ Installare `stripe` SDK
- ⬜ `src/lib/stripe.ts` — client Stripe + prodotti/prezzi costanti
- ⬜ API route `POST /api/stripe/checkout` — crea Stripe Checkout Session
- ⬜ API route `POST /api/stripe/webhook` — gestisce eventi:
  - `checkout.session.completed` → attiva subscription
  - `invoice.paid` → rinnova `currentPeriodEnd`
  - `customer.subscription.deleted` → cancella subscription
- ⬜ Feature gate: `src/lib/subscription.ts` → `getPlan(userId)` → Free / Starter / Pro
- ⬜ Limite Free tier: max 10 scontrini/mese — check in `emitReceipt` server action
- ⬜ Pagina `/dashboard/abbonamento` — piano corrente, upgrade, gestione (Stripe Customer Portal)
- ⬜ Variabili: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Piani:**

| Piano      | Prezzo mensile | Scontrini/mese | Dispositivi |
| ---------- | -------------- | -------------- | ----------- |
| Free       | €0             | 10             | 1           |
| Starter    | ~€2-3          | Illimitati     | 1           |
| Pro        | ~€4-5          | Illimitati     | Multi       |

_I prezzi esatti si definiscono in Stripe prima del deploy._

**Test attesi:** ~20 unit + 1 E2E → totale ~**514 unit + 9 E2E**

---

### v0.9.1 — Stabilità + E2E checkpoint ⬜

Checkpoint obbligatorio: questa non è una feature release, ma una verifica che tutto
funzioni prima di toccare la produzione.

**Task:**

- ⬜ Suite E2E completa su `test.scontrinozero.it`:
  - register → onboard → emetti scontrino (MockAdeClient) → storico → storno
  - upgrade Free → Starter (Stripe test mode)
  - reset password via Resend
- ⬜ Lighthouse audit: landing ≥90 mobile, dashboard ≥80 mobile
- ⬜ SonarCloud quality gate verde, zero issue Blocker/Critical
- ⬜ Smoke test su ambiente test con `ADE_MODE=mock`
- ⬜ Verificare che tutte le variabili d'ambiente `.env.example` siano aggiornate
- ⬜ Aggiornare Privacy Policy/ToS se necessario dopo test legale

**Test attesi:** ~10 nuovi E2E → totale ~**514 unit + 19 E2E**

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
- Stripe: Free + Starter + Pro (billing mensile)
- Feature gate Free tier (10 scontrini/mese)
- Welcome email + password reset email (Resend)
- Landing con prezzi reali, senza "beta"
- Privacy Policy, ToS, Cookie Policy aggiornate
- Deploy Docker via tag `v1.0.0`

### FUORI da v1.0.0 (vedi release post-lancio)

| Feature                            | Versione    |
| ---------------------------------- | ----------- |
| PWA (installabile, offline shell)  | v1.1.0      |
| Billing annuale                    | v1.2.0      |
| Email scontrino al cliente         | v1.3.0      |
| Dashboard analytics (grafici)      | v1.4.0      |
| AdE catalog sync                   | v1.5.0      |
| SPID session persistence (DB)      | v1.6.0      |
| CSV import prodotti + barcode      | v1.7.0      |
| Bluetooth print, Passkey, CIE      | v1.8.0+     |
| API pubblica, multi-operatore      | v2.0.0+     |

---

## Release post-lancio (v1.x.y)

| Versione    | Descrizione                                                              |
| ----------- | ------------------------------------------------------------------------ |
| **v1.1.0**  | PWA: `@serwist/next`, manifest, offline shell, install prompt             |
| **v1.2.0**  | Billing annuale (2 mesi gratis), Stripe Customer Portal polished          |
| **v1.3.0**  | Email scontrino al cliente (PDF allegato via Resend)                      |
| **v1.4.0**  | Dashboard analytics: totale giornaliero, sparkline revenue, export CSV    |
| **v1.5.0**  | Catalogo: modifica prodotto + sync AdE (HAR: aggiungi/modifica/elimina)   |
| **v1.6.0**  | SPID session persistence: cookie jar cifrato nel DB, re-auth on 401       |
| **v1.7.0**  | CSV import prodotti, barcode scanner (BarcodeDetector API), Umami analytics |
| **v1.8.0+** | Bluetooth printing (58/80mm), Passkey, CIE login, codice lotteria         |
| **v2.0.0+** | API pubblica, webhook, multi-operatore, integrazione e-commerce           |

---

## Storico sviluppo (fasi completate)

| Fase                          | Stato | Test al completamento      | Note                                              |
| ----------------------------- | ----- | -------------------------- | ------------------------------------------------- |
| 0 — Fondamenta                | ✅    | —                          | Next.js 16, shadcn/ui, CI/CD, Supabase, Drizzle   |
| 1A — Security fix + TDD       | ✅    | 23 unit                    | `isValidEmail`, waitlist API, SonarCloud verde     |
| 2 — Integrazione AdE          | ✅    | 92 unit (55 AdE dedicati)  | MockAdeClient + RealAdeClient, 6-phase Fisconline  |
| 1B — Landing page             | ✅    | 6 unit + 8 E2E             | Privacy ✅, ToS ✅, Sitemap ✅ — JSON-LD ⬜ (→ v0.8.1) |
| 3A — Fondamenta sicurezza     | ✅    | 148 unit + 8 E2E           | Sentry, pino, rate limiting, AES-256-GCM           |
| 3B — Auth + onboarding        | ✅    | 191 unit + 8 E2E           | Supabase Auth, wizard 3-step, credenziali cifrate  |
| 4A — Schema DB scontrini      | ✅    | 214 unit + 8 E2E           | `commercial_documents` + `commercial_document_lines` |
| 4B — UI cassa mobile-first    | ✅    | 305 unit + 8 E2E           | Tastierino, IVA, metodo pagamento, riepilogo        |
| 4C — Server actions + UI      | ✅    | 319 unit + 8 E2E           | `emitReceipt`, TanStack Query, optimistic updates   |
| 4D — Storico + storno + PDF   | ✅    | 422 unit + 8 E2E           | PDF pdfkit 58mm, share link pubblico, HTML receipt  |
| 4F — UI polish + registrazione| ✅    | 370→422 unit + 8 E2E       | `isStrongPassword`, paginazione storico, UX fixes   |
| 4G — Catalogo + nav mobile    | ✅    | 464 unit + 8 E2E           | `catalog_items`, CRUD, bottom-nav, tap→cassa        |
| 4H — Onboarding refactor      | ✅    | 469 unit + 8 E2E           | firstName/lastName, P.IVA da AdE, CAP, migration    |
| 4J — SPID login               | ✅    | 502 unit + 8 E2E           | SAML2 HTTP POST, push 2FA polling, MockAdeClient.loginSpid() |

---

## Riepilogo test cumulativi

| Versione    | Nuovi test (stimati) | Totale unit | Totale E2E |
| ----------- | -------------------- | ----------- | ---------- |
| (storico)   | —                    | 502         | 8          |
| **v0.7.0**  | ~10                  | ~512        | 8          |
| **v0.8.0**  | ~10                  | ~522        | 8          |
| **v0.8.1**  | ~5                   | ~527        | 8          |
| **v0.9.0**  | ~20                  | ~547        | 8          |
| **v0.9.1**  | ~0 unit / ~10 E2E    | ~547        | ~18        |
| **v1.0.0**  | 0 (solo tag)         | ~547        | ~18        |

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **v0.9.1 è un checkpoint**, non una feature release. Niente di nuovo finché non è verde.
4. **v1.0.0 è solo un tag push**: se c'è ancora sviluppo da fare, siamo a v0.9.x.
5. **Stripe prima di PWA**: meglio pochi utenti paganti che tanti utenti gratuiti non monetizzati.
