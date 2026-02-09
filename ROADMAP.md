# ScontrinoZero — Roadmap di sviluppo

Legenda: ⬜ Todo · 🔵 In progress · ✅ Done

---

## Fase 0 — Fondamenta progetto

Setup iniziale del progetto, tooling e infrastruttura.

- ⬜ Inizializzare progetto Next.js 15+ (App Router, TypeScript strict, Tailwind CSS 4)
- ⬜ Configurare shadcn/ui (tema custom, dark mode, colori brand)
- ⬜ Configurare ESLint + Prettier
- ⬜ Configurare husky + lint-staged (pre-commit hooks)
- ⬜ Setup Vitest + `@vitest/coverage-v8` + `vitest-sonar-reporter`
- ⬜ Setup Playwright
- ⬜ Creare `sonar-project.properties`
- ⬜ Creare Dockerfile (standalone mode) + `.dockerignore`
- ⬜ Creare `docker-compose.yml` (next-app + cloudflared)
- ⬜ Creare `.env.example`
- ⬜ Setup GitHub Actions: workflow CI (lint → type-check → test → sonar → build)
- ⬜ Setup GitHub Actions: workflow Deploy (tag-based, test + prod)
- ⬜ Setup Dependabot (`npm` + `github-actions`)
- ⬜ Creare progetto Supabase Cloud (prod + test)
- ⬜ Configurare Drizzle ORM + prima migrazione (schema base)
- ⬜ Health check endpoint (`/api/health`)
- ⬜ Primo deploy test su VPS (container vuoto, verifica tunnel Cloudflare)

---

## Fase 1 — Landing page + waitlist

Sito vetrina per raccogliere email e iniziare a costruire un'audience prima del lancio.

- ⬜ Design landing page mobile-first (hero, problema, soluzione, come funziona, pricing preview, CTA)
- ⬜ Implementare route group `(marketing)` con layout dedicato
- ⬜ Pagina `/` — hero + value proposition
- ⬜ Pagina `/prezzi` — tabella comparativa 3 piani (preview, senza Stripe ancora)
- ⬜ Pagina `/funzionalita` — feature principali con icone
- ⬜ Componente waitlist: input email + submit (salvare su Supabase, tabella `waitlist`)
- ⬜ Email di conferma iscrizione (Resend)
- ⬜ SEO: metadata, Open Graph, JSON-LD structured data
- ⬜ Sitemap (`next-sitemap`)
- ⬜ Setup Umami analytics (self-hosted su VPS)
- ⬜ Privacy Policy + Cookie Policy (pagine statiche)
- ⬜ Deploy landing page su `scontrinozero.it`

---

## Fase 2 — Spike integrazione AdE

**Attività di ricerca/esplorazione** per validare la fattibilità dell'integrazione diretta
con il portale Fatture e Corrispettivi. Questa è l'attività a rischio più alto — va
affrontata prima di costruire il resto dell'app.

- ⬜ Accedere al portale F&C con credenziali Fisconline personali
- ⬜ Analizzare il flusso web "Documento Commerciale Online" (network tab, DevTools)
- ⬜ Mappare tutte le chiamate HTTP interne (auth, emissione, conferma)
- ⬜ Documentare endpoint, headers, payload, cookies, token di sessione
- ⬜ Tentare di replicare il flusso con script Node.js (fetch/axios)
- ⬜ Se le API interne non sono stabili: testare automazione con Playwright headless
- ⬜ Definire interfaccia `AdeClient` (adapter pattern)
- ⬜ Implementare `MockAdeClient` (validazione + risposta simulata)
- ⬜ Implementare `RealAdeClient` (proof of concept funzionante)
- ⬜ Documentare il flusso tecnico completo in `src/lib/ade/README.md`
- ⬜ Decisione go/no-go: se integrazione diretta non è praticabile, valutare fallback
  su API terze parti (DataCash/Effatta)

---

## Fase 3 — Autenticazione e onboarding utente

- ⬜ Setup Supabase Auth (email/password + magic link)
- ⬜ Schema DB: tabelle `users`, `businesses` (dati attività: P.IVA, ragione sociale, indirizzo)
- ⬜ Route group `(auth)`: pagine login, register, reset-password, verify-email
- ⬜ Middleware Next.js per proteggere route `/dashboard/*`
- ⬜ Onboarding wizard (primo accesso dopo registrazione):
  1. Dati attività (P.IVA, ragione sociale, regime fiscale, codice attività)
  2. Collegamento credenziali Fisconline (cifratura at-rest)
  3. Verifica connessione AdE (test con MockAdeClient in ambiente test)
- ⬜ Pagina profilo/impostazioni utente

---

## Fase 4 — MVP core: emissione scontrini

Il cuore del prodotto: emettere uno scontrino elettronico da smartphone.

- ⬜ Schema DB: tabelle `receipts`, `receipt_items`, `daily_closures`
- ⬜ UI cassa mobile-first:
  - Inserimento rapido importi (tastierino numerico)
  - Selezione aliquota IVA (4%, 5%, 10%, 22%, esente)
  - Selezione metodo pagamento (contanti, elettronico, misto)
  - Riepilogo scontrino in tempo reale
  - Pulsante "Emetti scontrino"
- ⬜ Server action: emissione scontrino via `AdeClient`
- ⬜ Conferma emissione con numero documento e dettagli
- ⬜ Storico scontrini (TanStack Table + TanStack Query):
  - Lista scontrini del giorno
  - Filtro per data
  - Dettaglio singolo scontrino
- ⬜ Annullamento scontrino (reso)
- ⬜ Chiusura giornaliera automatica (o manuale)
- ⬜ Dashboard base: totale giornaliero, conteggio scontrini
- ⬜ Codice lotteria scontrini: input opzionale nel flusso emissione

---

## Fase 5 — Distribuzione scontrini e PWA

- ⬜ Condivisione scontrino via:
  - QR code (generato client-side)
  - Email (template React Email via Resend)
  - Link condivisibile (WhatsApp, SMS)
- ⬜ Setup PWA:
  - Web app manifest (icone, theme color, display standalone)
  - Service worker (@serwist/next)
  - Offline shell (UI base disponibile senza connessione)
  - Install prompt personalizzato
- ⬜ Ottimizzazione mobile: touch target, swipe gestures, viewport

---

## Fase 6 — Monitoring, stabilità, sicurezza

- ⬜ Integrare Sentry (`@sentry/nextjs`)
- ⬜ Structured logging (`pino`)
- ⬜ Rate limiting su API routes critiche
- ⬜ Audit delle credenziali Fisconline: cifratura AES-256, rotazione chiavi
- ⬜ Informativa trattamento dati credenziali Fisconline
- ⬜ Termini di Servizio + Condizioni di vendita
- ⬜ Test E2E Playwright: flussi critici (registrazione → emissione → annullo)

---

## Fase 7 — Pagamenti e piani

Beta gratuita → lancio con 3 piani a pagamento.

- ⬜ Definire i 3 piani: feature, limiti, prezzi (basati su analisi competitor)
- ⬜ Integrare Stripe Billing:
  - Checkout session per sottoscrizione
  - Webhook per gestione eventi (subscription created/updated/cancelled)
  - Customer portal per gestione abbonamento
- ⬜ Stripe test mode nell'ambiente test
- ⬜ Middleware per enforcement piano (feature gating)
- ⬜ Pagina `/prezzi` funzionante con pulsanti di acquisto
- ⬜ Email transazionali: conferma abbonamento, rinnovo, scadenza

---

## Fase 8 — Lancio e post-lancio

- ⬜ Deploy produzione su `scontrinozero.it`
- ⬜ Comunicazione alla waitlist (email di lancio)
- ⬜ Richiedere recensioni ai primi utenti (Trustpilot, App Store style)
- ⬜ Blog/contenuti SEO: guide "come emettere scontrini senza registratore"
- ⬜ Monitoraggio metriche: churn, conversione, MRR

---

## Backlog — Feature future (post-lancio)

Funzionalità da valutare in base al feedback utenti e alle priorità di business.

- ⬜ Gestione catalogo prodotti/servizi (categorie, prezzi preimpostati, preferiti)
- ⬜ Import CSV/XLS prodotti (nessun competitor lo offre)
- ⬜ Scanner barcode via fotocamera
- ⬜ Stampa Bluetooth (stampanti termiche 58/80mm)
- ⬜ Integrazione POS: SumUp, Nexi, Satispay
- ⬜ Fatturazione elettronica (integrazione SDI o servizio terzo)
- ⬜ Dashboard avanzata: grafici vendite, trend, confronto periodi, export Excel/CSV
- ⬜ Multi-operatore: ruoli (titolare, dipendente), log attività
- ⬜ Integrazione e-commerce (WooCommerce, Shopify)
- ⬜ Pagina `/chi-siamo`
- ⬜ Blog con guide MDX per SEO organico
- ⬜ Notifiche push (PWA push notifications)
- ⬜ Modalità offline con coda di sincronizzazione
- ⬜ API pubblica / webhook per integrazioni terze parti
- ⬜ App Capacitor (se servono feature native: NFC, stampa nativa)

---

## Note

- **Approccio TDD**: ogni task di implementazione inizia scrivendo i test
- **La Fase 2 (spike AdE) è bloccante**: se l'integrazione diretta fallisce, bisogna
  ripianificare con API terze parti — meglio scoprirlo subito
- **Landing page (Fase 1) e spike AdE (Fase 2) possono procedere in parallelo**
- **Un solo sviluppatore**: le fasi sono sequenziali, con l'eccezione di Fase 1 + 2
