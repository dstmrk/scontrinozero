# CLAUDE.md — ScontrinoZero

## Progetto

ScontrinoZero è un registratore di cassa virtuale (SaaS) mobile-first che consente a
esercenti e micro-attività di emettere scontrini elettronici e trasmettere i corrispettivi
all'Agenzia delle Entrate senza registratore telematico fisico, sfruttando la procedura
"Documento Commerciale Online".

## Roadmap e piano di sviluppo

Il piano di sviluppo dettagliato con fasi sequenziali, test attesi e checkpoint di review
è in **`PLAN.md`** (root del repo). Il **`ROADMAP.md`** contiene il riepilogo ad alto livello.

**Fase corrente:** Phase 4F (UI polish + registrazione)

**Approccio TDD:** Per ogni fase, scrivere i test PRIMA dell'implementazione.
I test di validazione e degli endpoint usano `vi.mock` per isolare le dipendenze (Drizzle, etc.).

**Sequenza fasi:** 0 ✅ → 1A ✅ → 2 ✅ (AdE spike) → 1B ✅ (landing) → 3A ✅ (security infra) →
3B ✅ (auth) → 4A-4D ✅ (MVP core) → 4F 🔵 (UI polish) → 4G (catalogo+nav) → 4H (onboarding refactor) →
5 (PWA) → 6 (stabilità) → 7 (Stripe) → 8 (lancio)

## Principi di prodotto

### Performance percepita come priorità #1

L'obiettivo è che ogni interazione si senta **istantanea**. L'emissione di uno scontrino
deve sembrare immediata anche se il portale AdE risponde in 2-5 secondi.

Tecniche:

- **Optimistic UI** — TanStack Query mutations: lo scontrino appare come "emesso"
  immediatamente, il backend completa la trasmissione AdE in background.
  Rollback automatico se l'invio fallisce.
- **Skeleton loading** — mai schermi bianchi, sempre placeholder animati
- **Route prefetching** — Next.js prefetch dei link visibili nel viewport
- **Stale-while-revalidate** — TanStack Query mostra dati cached istantaneamente,
  aggiorna in background
- **Transizioni fluide** — no full-page reload, animazioni CSS minimali ma percettibili
- **SSG per marketing** — pagine statiche pre-renderizzate, TTFB quasi zero
- **Service worker** — shell PWA in cache, navigazione offline-first

### Hobby project → il più economico del mercato

Questo è un progetto hobby con costi fissi ~€0. Nessun dipendente, nessuna API terze
parti a pagamento, VPS già pagata. Il costo marginale per utente è praticamente zero.
Questo permette un pricing aggressivo impossibile per i competitor.

### Leggeri sulle risorse

La VPS ha risorse limitate. Ogni dipendenza, ogni libreria, ogni processo deve
giustificare la propria esistenza.

- **No headless browser** — niente Playwright, Puppeteer o Chromium in produzione.
  L'integrazione AdE usa esclusivamente chiamate HTTP dirette (fetch/axios).
  La generazione PDF usa **pdfkit** (Node.js puro, ~500KB), coerente con questo vincolo.
  ⚠️ pdfkit richiede `serverExternalPackages: ["pdfkit"]` in `next.config.ts` per evitare
  che Turbopack riscriva `__dirname` in `/ROOT` e rompa la risoluzione dei font AFM.
- **Dipendenze minime** — aggiungere librerie solo quando strettamente necessario.
  Preferire soluzioni native o leggere.
- **Next.js standalone** — output ottimizzato, solo i file necessari (~100MB vs ~1GB)
- **Docker slim** — immagine base leggera, no tool di sviluppo nel container
- **Un solo container** — next-app + cloudflared, niente orchestrazione complessa

### Open source + SaaS (O'Saasy License)

- **Self-hosted gratis** — chiunque può scaricare, installare e usare il software
  sul proprio server senza pagare nulla
- **Versione hosted a pagamento** — noi offriamo il servizio gestito (SaaS) con
  hosting, aggiornamenti, backup, supporto
- **O'Saasy License** — permissiva come MIT, ma vieta di usare il software per
  offrire un SaaS concorrente
- Modello collaudato (GitLab, Plausible, Sentry, Umami)
- La versione self-hosted è un selling point di fiducia: le credenziali Fisconline
  restano sul server dell'utente, nessun dato transita da terzi

### Pricing: i meno cari del mercato

| Piano             | Prezzo                    | Target                    | Feature                             |
| ----------------- | ------------------------- | ------------------------- | ----------------------------------- |
| **Free (hosted)** | €0                        | Chi vuole provare         | 10 scontrini/mese, 1 dispositivo    |
| **Starter**       | ~€2-3/mese o ~€19-25/anno | Micro-attività, ambulanti | Scontrini illimitati, 1 dispositivo |
| **Pro**           | ~€4-5/mese o ~€39-49/anno | Negozi, attività regolari | Multi-device, dashboard, export     |
| **Self-hosted**   | €0 (sempre)               | Tecnici, smanettoni       | Tutte le feature, gestione autonoma |

I prezzi esatti saranno definiti nella Fase 7, ma l'obiettivo è chiaro: battere
Scontrinare (€30/anno) come prezzo più basso sul mercato per la versione hosted,
offrendo feature superiori. Il free tier hosted abbassa la barriera d'ingresso
per il target non tecnico.

## Tech Stack

### Frontend

| Tecnologia                   | Ruolo                      | Note                                       |
| ---------------------------- | -------------------------- | ------------------------------------------ |
| **Next.js 15+** (App Router) | Framework React full-stack | SSR/SSG, API routes, server actions        |
| **React 19**                 | UI library                 |                                            |
| **TypeScript**               | Type safety                | Strict mode                                |
| **Tailwind CSS 4**           | Styling utility-first      |                                            |
| **shadcn/ui**                | Component library          | Copy-paste, customizzabile, Radix UI sotto |
| **TanStack Query v5**        | Data fetching client-side  | Cache, mutations, optimistic updates       |
| **TanStack Table**           | Tabelle dati               | Già integrato in shadcn/ui DataTable       |
| **PWA** (@serwist/next)      | Mobile-first installabile  | Service worker, offline shell, manifest    |

### Backend

| Tecnologia                              | Ruolo             | Note                                           |
| --------------------------------------- | ----------------- | ---------------------------------------------- |
| **Next.js API Routes + Server Actions** | Backend primario  | Integrato nel monolite Next.js                 |
| **Supabase Cloud**                      | BaaS (PostgreSQL) | DB, auth, storage — free tier (50k MAU, 500MB) |

### Database

- **PostgreSQL** via Supabase Cloud (free tier per iniziare, poi Pro $25/mese)
- **Drizzle ORM** — type-safe, leggero, ottima DX con TypeScript
- **Row Level Security (RLS)** — sicurezza a livello di riga per multi-tenancy

### Autenticazione

- **Supabase Auth** — email/password, magic link
- NO SPID/CIE come metodo di login (richiede accreditamento AgID come SP privato)

### Integrazione Agenzia delle Entrate

L'AdE **non espone API REST pubbliche**. La procedura "Documento Commerciale Online"
è un'interfaccia web nel portale Fatture e Corrispettivi.

**Strategia: integrazione diretta** (no API terze parti, no headless browser):

- Reverse-engineering delle chiamate HTTP che il portale AdE effettua internamente
- L'utente fornisce le proprie credenziali Fisconline (cifrate, mai in chiaro)
- Il backend replica il flusso con chiamate HTTP dirette (fetch/axios)
- **NO Playwright/headless browser** — troppo pesante per una VPS limitata
  (~400MB RAM per Chromium). Solo chiamate HTTP leggere.
- Base legale: Interpello AdE n. 956-1523/2020 — l'AdE non si oppone ai
  "velocizzatori" purché rispettino le prescrizioni normative

Fasi:

1. Analizzare il portale Fatture e Corrispettivi (network tab, chiamate XHR/fetch)
2. Mappare gli endpoint interni usati dalla web app dell'AdE
3. Replicare il flusso (auth → emissione → conferma) dal nostro backend
4. Gestire le credenziali utente in modo sicuro (cifratura at-rest)
5. Implementare retry e fallback per indisponibilità AdE

### Pagamenti SaaS (subscription)

- **Stripe** — fee più basse in EU (1.5% + €0.25 per carte europee)
- Il target è B2B (esercenti italiani) → IVA gestibile, reverse charge
- Stripe Billing per abbonamenti ricorrenti
- Alternativa futura: Paddle come MoR se si espande all'estero

### Email transazionali

- **Resend** — email transazionali (welcome, password reset, invio scontrino)
- Free tier: 3.000 email/mese (sufficiente per fase iniziale)
- DX moderna, integrazione React Email per template type-safe
- Pro: $20/mese per 50k email quando si scala

### Deployment

- **Docker self-hosted su VPS** (infrastruttura già disponibile)
  - Next.js in modalità `standalone` (output ottimizzato per container)
  - **Cloudflare Tunnel** (cloudflared) come ingress (già attivo sulla VPS)
    - Nessuna porta da esporre pubblicamente
    - HTTPS gestito da Cloudflare (no Let's Encrypt da configurare)
    - CDN e DDoS protection inclusi
    - IP del server nascosto
  - Docker Compose per orchestrazione (next-app + cloudflared)
  - Docker logging limits (`max-size: 10m`, `max-file: 3`) per evitare log bloat
  - `.dockerignore` accurato: esclude tests, docs, `.github/`, `node_modules`
  - Health check endpoint (`/api/health`) per Docker healthcheck e monitoring
  - `.env.example` come template per onboarding rapido
- **Supabase Cloud** per il database (free tier, nessun DB da gestire sulla VPS)
- NO Vercel (il piano Hobby vieta uso commerciale; Pro costa $20/mese non necessario)

### Monitoring e observability

- **Sentry** — error tracking e performance monitoring
  - Free tier: 5k errori/mese, 10k transazioni performance
  - SDK Next.js ufficiale (`@sentry/nextjs`)
- **Structured logging** — tramite `pino` o logging nativo Next.js

### Analytics

- **Umami** (self-hosted su VPS) — web analytics privacy-first
  - Open source, GDPR compliant senza cookie banner
  - Stack: Next.js + PostgreSQL (stesso stack, può usare Supabase come DB)
  - Free illimitato self-hosted
  - Script leggero (~2 KB)
  - Alternativa: Plausible (simile ma senza free tier cloud)

### Code quality

- **SonarQube Cloud** (ex SonarCloud) — analisi statica, sicurezza, code smells
  - Free tier: fino a 50k LOC per repo privati, 5 utenti
  - PR decoration: mostra problemi direttamente nelle pull request GitHub
  - Quality Gate: blocca merge che introducono bug o abbassano la coverage
  - Importante per sicurezza dato che gestiamo credenziali Fisconline
- **ESLint + Prettier** — linting e formattazione
- **lint-staged + husky** — pre-commit hooks (lint e format solo sui file staged)
- **Dependabot** — aggiornamenti automatici dipendenze (settimanale, patch/minor raggruppati)

### CI/CD

- **GitHub Actions** — test, lint, build, deploy automatizzato
  - Free tier generoso per repo privati (2.000 minuti/mese)
- **Smart skip**: i workflow analizzano il diff e saltano se non ci sono file rilevanti
  (risparmio minuti CI su modifiche a soli `.md`, `static/`, etc.)
- **Pipeline CI** (su push/PR verso main):
  1. Lint (ESLint) + type-check (`tsc --noEmit`)
  2. Test con coverage (Vitest → lcov)
  3. SonarQube Cloud scan (analisi statica + coverage)
  4. Build
- **Pipeline Deploy** (su push di tag):
  - Tag `v*.*.*-test` → build Docker → deploy su ambiente **test**
  - Tag `v*.*.*` (senza suffisso) → build Docker → deploy su **produzione**
  - Immagini Docker su GitHub Container Registry (ghcr.io)
  - Build multi-arch (`linux/amd64` + `linux/arm64`) per flessibilità
  - Deploy via SSH sulla VPS con `docker compose pull && up -d`
  - Ambiente `production` in GitHub può richiedere approvazione manuale

### Testing

- **Approccio TDD** — test-first: scrivere i test prima dell'implementazione
- **Vitest** — unit e integration test
  - Coverage con `@vitest/coverage-v8` (report lcov per SonarQube)
  - `vitest-sonar-reporter` per report esecuzione test
- **Playwright** — E2E test (solo in CI/dev, non in produzione)
- I componenti shadcn/ui (`src/components/ui/`) sono esclusi dalla coverage

### Monorepo (se necessario)

- **Turborepo** — per separare packages (app, shared, etc.)

## Ambienti: test e produzione

### Due ambienti sulla stessa VPS

|                   | **Test**                               | **Produzione**               |
| ----------------- | -------------------------------------- | ---------------------------- |
| URL               | `test.scontrinozero.it`                | `scontrinozero.it`           |
| Cloudflare Tunnel | Route separata verso container test    | Route verso container prod   |
| Docker Compose    | `/opt/scontrinozero-test/`             | `/opt/scontrinozero/`        |
| DB Supabase       | Progetto Supabase separato (free tier) | Progetto Supabase principale |
| Variabile         | `ADE_MODE=mock`                        | `ADE_MODE=real`              |
| Stripe            | Stripe test mode (chiavi `sk_test_*`)  | Stripe live mode             |

### Strategia mock AdE per ambiente test

L'integrazione AdE usa un **pattern adapter/strategy**:

- Interfaccia `AdeClient` con metodi: `submitReceipt()`, `closeDay()`, etc.
- `RealAdeClient` — invia davvero all'AdE (produzione)
- `MockAdeClient` — esegue **tutta la logica** (validazione, formattazione,
  preparazione payload) ma si ferma prima dell'invio HTTP all'AdE, restituendo
  una risposta simulata
- Controllato da `ADE_MODE=real|mock` (variabile d'ambiente)
- Il codice in test è **identico** a quello in produzione, cambia solo l'ultimo step

### Flusso di rilascio (tag-based)

```
sviluppo su branch → PR → merge su main → CI (test + lint + sonar)
                                              ↓
                              git tag v1.0.0-test → deploy TEST
                              (verifico su test.scontrinozero.it)
                                              ↓
                              git tag v1.0.0 → deploy PRODUZIONE
```

## Sito vetrina (landing/marketing)

Stesso progetto Next.js, non un sito separato:

- Le pagine marketing (/, /prezzi, /funzionalita, /chi-siamo) sono route SSG
  nel Next.js App Router — generate staticamente al build, veloci
- L'app SaaS vive sotto /dashboard (o /app) — route dinamiche protette da auth
- Vantaggi: un solo deploy, un solo dominio, SEO integrato
- shadcn/ui per i componenti anche nella landing (coerenza visiva)
- Contenuti marketing: MDX per pagine rich-text (blog, guide, FAQ)

### SEO e marketing

- Meta tag e Open Graph automatici via Next.js `metadata` API
- Sitemap generata automaticamente (`next-sitemap`)
- Structured data (JSON-LD) per rich snippets Google
- Blog/risorse in MDX per content marketing e SEO organico

## Conformità legale

- **Privacy Policy** — obbligatoria (GDPR), generabile con iubenda o simili
- **Cookie Policy** — se si usano solo cookie tecnici (Supabase auth) e analytics
  cookieless (Umami), il banner cookie non è necessario per GDPR
- **Termini di Servizio** — contratto d'uso del SaaS
- **Condizioni di vendita** — per gli abbonamenti Stripe
- **Informativa trattamento dati** — specifica per credenziali Fisconline
  (dato sensibile, cifratura at-rest, finalità limitate)

## Decisioni architetturali

### Perché Next.js e non solo React (SPA)?

- SSR per SEO (landing page, marketing)
- Server Actions/API Routes eliminano bisogno di backend separato
- Ecosystem maturo, standard de facto per React SaaS
- Ottimo supporto PWA
- Self-hosting eccellente con `output: 'standalone'`

### Perché Supabase e non Firebase?

- PostgreSQL standard (no vendor lock-in)
- Open source, self-hostable in futuro se necessario
- Pricing prevedibile (free tier generoso: 50k MAU, 500MB DB)
- RLS nativo per multi-tenancy
- Migrazione facile verso qualsiasi PostgreSQL host

### Perché PWA e non app nativa?

- Un solo codebase per mobile + desktop
- Nessun costo App Store / Play Store
- Installabile su home screen
- Aggiornamenti istantanei (no review store)
- Il target (micro-attività) preferisce semplicità
- Si può valutare Capacitor in futuro se servono feature native

### Perché shadcn/ui?

- Componenti belli e accessibili out-of-the-box
- Completamente customizzabili (copia nel progetto, non dipendenza)
- Basato su Radix UI (accessibilità) + Tailwind CSS
- Design minimale, perfetto per UX mobile-first
- Grande community e ecosystem

### Perché integrazione diretta AdE?

- Nessun costo per scontrino (API terze parti addebitano per documento)
- Nessuna dipendenza da servizi terzi (DataCash, Effatta, etc.)
- Margini più alti sul prodotto SaaS
- Più complessità tecnica, ma la stessa cosa che fanno tutti i competitor
- Base legale confermata dall'interpello AdE

### Perché Cloudflare Tunnel e non Caddy/Nginx?

- Già attivo sulla VPS → zero configurazione aggiuntiva
- Nessuna porta pubblica da esporre (outbound-only connection)
- HTTPS automatico senza Let's Encrypt
- CDN, DDoS protection e WAF inclusi gratuitamente
- IP del server completamente nascosto
- Docker Compose: basta aggiungere il servizio cloudflared

### Perché Stripe?

- Fee più basse in EU: 1.5% + €0.25 (vs 5% + $0.50 di Paddle/LemonSqueezy)
- Payout in 2 giorni su conto italiano (€0.30 per payout, nessuna fee cross-border)
- API eccellente, documentazione perfetta
- Stripe Billing per gestione abbonamenti
- Il target è solo Italia inizialmente → VAT semplice, non serve un MoR
- Se in futuro si espande all'estero, si può migrare a Paddle come MoR

### Perché Resend per email?

- Free tier 3k email/mese (sufficiente per MVP e oltre)
- React Email per template type-safe nello stesso stack
- DX moderna, API semplice
- Deliverability eccellente

### Perché SonarQube Cloud?

- Free tier generoso (50k LOC, 5 utenti) — costo zero
- Analisi di sicurezza (SAST) cruciale per un'app che gestisce credenziali fiscali
- PR decoration: feedback immediato su ogni pull request
- Quality Gate: soglie configurabili su coverage, bug, vulnerabilità
- Setup minimale: un file `sonar-project.properties` + uno step in GitHub Actions
- Si integra nativamente con Vitest (report lcov + sonar-reporter)

### Perché TDD?

- Qualità del codice più alta fin dall'inizio
- Meno regressioni: ogni feature nasce con i suoi test
- Refactoring sicuro: i test proteggono il comportamento esistente
- Design migliore: scrivere test prima forza a pensare alle interfacce
- Fondamentale per l'integrazione AdE (fragile, richiede test robusti)

### Perché due ambienti (test + prod)?

- L'integrazione AdE è irreversibile: uno scontrino emesso non si cancella
- Il mock AdE permette di testare tutto il flusso senza conseguenze fiscali
- Stesso codice, stessa infra, solo l'ultimo step cambia (`ADE_MODE`)
- Stripe test mode per verificare i pagamenti senza soldi reali
- Deploy tag-based: processo chiaro, auditabile, con approval gate

### Perché Umami per analytics?

- Self-hosted gratis (nessun costo aggiuntivo, gira sulla stessa VPS)
- GDPR compliant by design, nessun cookie → nessun banner cookie
- Stesso stack tecnologico (Next.js + PostgreSQL)
- Script leggero (~2 KB), non impatta le performance

## Competitor analizzati

| Nome            | Modello                  | Prezzo               | Recensioni             | Note                                                                            |
| --------------- | ------------------------ | -------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| **Billy**       | App nativa + Web         | €70/anno (€7/mese)   | 4.9/5 Trustpilot (572) | Leader per recensioni, 6 integrazioni POS, modalità offline, 20 fatture incluse |
| **Scontrina**   | App nativa (iOS/Android) | ~€80/anno (€10/mese) | 4.4/5 App Store (45)   | UI moderna, integrazione WooCommerce/Shopify, feature ristorazione              |
| **MyCassa**     | App nativa + Web         | €49/anno             | N/D                    | Scanner barcode, preconti, interpello AdE ufficiale, 5 device gratis            |
| **MyScontrino** | App + Web                | €79+IVA/anno         | N/D                    | Bundle hardware+software, distribuzione tramite rivenditori locali, UI datata   |
| **Scontrinare** | Web app + App native     | €30/anno             | N/D                    | Il più economico, max ~8k scontrini/anno, feature set limitato                  |

### Posizionamento ScontrinoZero vs competitor

- **Nessun competitor ha una vera PWA moderna** — tutti usano app native o web basilari
- **UX/UI**: la maggioranza ha interfacce datate; solo Scontrina è moderna
- **Fascia di prezzo mercato**: €30-80/anno, sweet spot €49-70/anno
- **Billy domina per social proof** (572 recensioni Trustpilot) — priorità raccogliere recensioni early
- **Pricing flessibile è apprezzato**: Billy offre annuale/mensile/giornaliero
- **Differenziatori da perseguire**: PWA installabile, dashboard web su desktop,
  UX moderna (shadcn/ui), offline mode, import CSV prodotti

## Struttura progetto (prevista)

```
scontrinozero/
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (marketing)/    # Route group: landing, prezzi, blog (SSG)
│   │   ├── (auth)/         # Route group: login, register, reset-password
│   │   └── dashboard/      # App SaaS protetta da auth
│   ├── components/         # Componenti React (shadcn/ui + custom)
│   │   └── ui/             # shadcn/ui components
│   ├── lib/                # Utility, client Supabase, helpers
│   │   └── ade/            # Modulo integrazione Agenzia delle Entrate
│   ├── server/             # Server actions, business logic
│   ├── emails/             # Template email (React Email)
│   └── types/              # TypeScript types/interfaces
├── public/                 # Static assets, PWA manifest, icons
├── supabase/               # Migrazioni DB, seed, config
├── tests/                  # Test Vitest + Playwright
├── docker/                 # Dockerfile, docker-compose.yml
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
├── CLAUDE.md
├── README.md
└── LICENSE.md
```

## Costi stimati (fase iniziale)

| Voce                                       | Costo                                 |
| ------------------------------------------ | ------------------------------------- |
| VPS (già pagata)                           | €0 aggiuntivi                         |
| Cloudflare Tunnel (già attivo)             | €0                                    |
| Supabase Cloud free tier (x2: prod + test) | €0                                    |
| SonarQube Cloud free tier                  | €0                                    |
| Resend free tier (3k email/mese)           | €0                                    |
| Sentry free tier                           | €0                                    |
| Umami self-hosted                          | €0                                    |
| GitHub Actions free tier                   | €0                                    |
| Stripe                                     | 1.5% + €0.25 per transazione          |
| Dominio                                    | ~€10/anno                             |
| **Totale fisso mensile**                   | **~€0** (solo costi variabili Stripe) |

## Risorse e riferimenti

- [AdE — Documento Commerciale Online](https://www.agenziaentrate.gov.it/portale/se-si-utilizza-la-procedura-documento-commerciale-online)
- [Interpello AdE n. 956-1523/2020 (base legale)](https://www.my-cassa.it/wp-content/uploads/Interpello_CassApp.pdf)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Cloudflare Tunnel + Docker setup](https://www.buildwithmatija.com/blog/cloudflared-tunnel-expose-docker-no-nginx-open-ports)
- [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/)
- [shadcn/ui docs](https://ui.shadcn.com/)
- [Supabase docs](https://supabase.com/docs)
- [Drizzle ORM docs](https://orm.drizzle.team/)
- [Stripe Italia pricing](https://stripe.com/pricing)
- [Resend docs](https://resend.com/docs)
- [Umami docs](https://umami.is/docs)
- [Sentry Next.js SDK](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [SonarQube Cloud docs](https://docs.sonarsource.com/sonarqube-cloud/)
- [SonarQube Cloud free tier](https://www.sonarsource.com/products/sonarqube/cloud/new-pricing-plans/)
- [Vitest coverage docs](https://vitest.dev/guide/coverage.html)
- [vitest-sonar-reporter](https://www.npmjs.com/package/vitest-sonar-reporter)
- [Effatta API (riferimento competitor)](https://effatta.it/scontrino-elettronico/)
- [DataCash API (riferimento competitor)](https://datacash.it/api-developer/)

## File HAR da analizzare (fasi future)

Presenti nella root del repo, da analizzare prima delle relative fasi di sviluppo:

| File                             | Feature                                            | Fase   |
| -------------------------------- | -------------------------------------------------- | ------ |
| `dati_doc_commerciale.har`       | Aggiornamento dati business su AdE post-onboarding | 4H     |
| `aggiungi_prodotto_catalogo.har` | Aggiunta prodotto su rubrica AdE                   | 4G     |
| `modifica_prodotto_catalogo.har` | Modifica prodotto su rubrica AdE                   | futuro |
| `elimina_prodotto_catalogo.har`  | Eliminazione prodotto su rubrica AdE               | futuro |
| `ricerca_prodotto_catalogo.har`  | Ricerca prodotto su rubrica AdE                    | 4G     |
| `ricerca_documento.har`          | Ricerca documento su AdE                           | futuro |
| `login_spid.har`                 | SPID login flow                                    | futuro |
| `login_cie.har`                  | CIE login flow                                     | futuro |
