# ScontrinoZero — Piano di sviluppo

## Versione corrente: v1.1.0 ⬜ (prossima release)

Il piano usa **release semantiche** (vx.y.z). La v1.0.0 è stata rilasciata in produzione.

**Approccio TDD:** per ogni release, i test si scrivono _prima_ dell'implementazione.

---

## Release pre-lancio → v1.0.0

| Versione   | Descrizione                  | Stato |
| ---------- | ---------------------------- | ----- |
| **v0.7.0** | AdE fiscal data update       | ✅    |
| **v0.8.0** | Email transazionali (Resend) | ✅    |
| **v0.8.1** | Landing completeness         | ✅    |
| **v0.8.2** | Email polish + DB fix        | ✅    |
| **v0.9.0** | Stripe payments              | ✅    |
| **v0.9.1** | Stabilità + E2E checkpoint   | ✅    |
| **v1.0.0** | Lancio pubblico              | ✅    |

---

### v1.0.0 — Lancio pubblico ✅

Rilasciato in produzione via tag `v1.0.0`. Tutte le checklist completate.
**718 unit test + ~18 E2E test.**

---

## Definizione v1.0.0: incluso / escluso ✅

### IN v1.0.0 (rilasciato)

- Emissione scontrino via `RealAdeClient` (Fisconline)
- Auth: email/password + SPID (per AdE)
- Onboarding wizard 3-step completo
- Storico + storno + PDF + share link pubblico
- Catalogo prodotti locale (CRUD)
- Settings (dati business, credenziali AdE, piano corrente)
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

| Fase                           | Stato | Test al completamento     | Note                                                                                                                               |
| ------------------------------ | ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Fondamenta                 | ✅    | —                         | Next.js 16, shadcn/ui, CI/CD, Supabase, Drizzle                                                                                    |
| 1A — Security fix + TDD        | ✅    | 23 unit                   | `isValidEmail`, waitlist API, SonarCloud verde                                                                                     |
| 2 — Integrazione AdE           | ✅    | 92 unit (55 AdE dedicati) | MockAdeClient + RealAdeClient, 6-phase Fisconline                                                                                  |
| 1B — Landing page              | ✅    | 6 unit + 8 E2E            | Privacy ✅, ToS ✅, Sitemap ✅                                                                                                     |
| 3A — Fondamenta sicurezza      | ✅    | 148 unit + 8 E2E          | pino, rate limiting, AES-256-GCM (Sentry rimandato a v0.9.1)                                                                       |
| 3B — Auth + onboarding         | ✅    | 191 unit + 8 E2E          | Supabase Auth, wizard 3-step, credenziali cifrate                                                                                  |
| 4A — Schema DB scontrini       | ✅    | 214 unit + 8 E2E          | `commercial_documents` + `commercial_document_lines`                                                                               |
| 4B — UI cassa mobile-first     | ✅    | 305 unit + 8 E2E          | Tastierino, IVA, metodo pagamento, riepilogo                                                                                       |
| 4C — Server actions + UI       | ✅    | 319 unit + 8 E2E          | `emitReceipt`, TanStack Query, optimistic updates                                                                                  |
| 4D — Storico + storno + PDF    | ✅    | 422 unit + 8 E2E          | PDF pdfkit 58mm, share link pubblico, HTML receipt                                                                                 |
| 4F — UI polish + registrazione | ✅    | 422 unit + 8 E2E          | `isStrongPassword`, paginazione storico, UX fixes                                                                                  |
| 4G — Catalogo + nav mobile     | ✅    | 464 unit + 8 E2E          | `catalog_items`, CRUD, bottom-nav, tap→cassa                                                                                       |
| 4H — Onboarding refactor       | ✅    | 469 unit + 8 E2E          | firstName/lastName, P.IVA da AdE, CAP, migration                                                                                   |
| 4J — SPID login                | ✅    | 502 unit + 8 E2E          | SAML2 HTTP POST, push 2FA polling, MockAdeClient.loginSpid()                                                                       |
| 4K — Security hardening        | ✅    | ~511 unit + 8 E2E         | CORS, RLS, npm audit CI, rate limiting, audit log, account deletion                                                                |
| 4L — Terms acceptance tracking | ✅    | ~512 unit + 8 E2E         | `terms_accepted_at` + `terms_version` su `profiles`; `/termini/v01` permalink + redirect                                           |
| v0.7.0 — AdE fiscal data       | ✅    | ~521 unit + 8 E2E         | `buildCedenteFromBusiness()`, rimosso `getFiscalData()`, `modificati: true` nel payload                                            |
| v0.8.0 — Email (Resend)        | ✅    | 558 unit + 8 E2E          | `sendEmail()`, WelcomeEmail, PasswordResetEmail, stili condivisi, hook post-signUp                                                 |
| v0.8.1 — Landing completeness  | ✅    | 572 unit + 8 E2E          | Prezzi reali, rimozione beta, JSON-LD, sitemap `/termini/v01`, date marzo 2026                                                     |
| v0.8.2 — Email polish + DB fix | ✅    | 602 unit + 8 E2E          | FK constraint rename, guard test identifier lengths, PasswordResetEmail via generateLink, AccountDeletionEmail                     |
| v0.9.0 — Stripe payments       | ✅    | 701 unit + 8 E2E          | DB schema billing, stripe.ts + plans.ts, checkout + webhook API, feature gate catalogo, TrialExpiringEmail, /dashboard/abbonamento |

---

## Riepilogo test cumulativi

| Versione   | Nuovi test (stimati)   | Totale unit | Totale E2E |
| ---------- | ---------------------- | ----------- | ---------- |
| (storico)  | —                      | 502         | 8          |
| **4K**     | ~9                     | ~511        | 8          |
| **4L**     | ~1                     | ~512        | 8          |
| **v0.7.0** | ~9                     | ~521        | 8          |
| **v0.8.0** | 37                     | **558**     | 8          |
| **v0.8.1** | 13                     | **572**     | 8          |
| **v0.8.2** | 30                     | **602**     | 8          |
| **v0.9.0** | 99                     | **701**     | 8          |
| **v0.9.1** | 17 unit + E2E suite ✅ | **718**     | ~18        |
| **v1.0.0** | 0 (solo tag) ✅        | **718**     | ~18        |

---

## Principi del piano

1. **Minimalismo**: ogni release include solo quello che sblocca la successiva o il lancio.
2. **TDD**: i test si scrivono prima dell'implementazione. Ogni `it()` ha almeno un `expect()`.
3. **Stripe prima di PWA**: meglio pochi utenti paganti che tanti utenti gratuiti non monetizzati.
