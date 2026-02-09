# CLAUDE.md — ScontrinoZero

## Progetto

ScontrinoZero è un registratore di cassa virtuale (SaaS) mobile-first che consente a
esercenti e micro-attività di emettere scontrini elettronici e trasmettere i corrispettivi
all'Agenzia delle Entrate senza registratore telematico fisico, sfruttando la procedura
"Documento Commerciale Online".

## Tech Stack

### Frontend

| Tecnologia | Ruolo | Note |
|---|---|---|
| **Next.js 15+** (App Router) | Framework React full-stack | SSR/SSG, API routes, server actions |
| **React 19** | UI library | |
| **TypeScript** | Type safety | Strict mode |
| **Tailwind CSS 4** | Styling utility-first | |
| **shadcn/ui** | Component library | Copy-paste, customizzabile, Radix UI sotto |
| **PWA** (@serwist/next) | Mobile-first installabile | Service worker, offline shell, manifest |

### Backend

| Tecnologia | Ruolo | Note |
|---|---|---|
| **Next.js API Routes + Server Actions** | Backend primario | Integrato nel monolite Next.js |
| **Supabase Cloud** | BaaS (PostgreSQL) | DB, auth, storage — free tier (50k MAU, 500MB) |

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

**Strategia: integrazione diretta** (no API terze parti):
- Reverse-engineering delle chiamate HTTP che il portale AdE effettua internamente
- L'utente fornisce le proprie credenziali Fisconline (cifrate, mai in chiaro)
- Il backend automatizza l'emissione del documento commerciale
- **Playwright** come fallback per automazione headless browser (se le API interne
  non sono stabili o accessibili)
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

### CI/CD

- **GitHub Actions** — test, lint, build, deploy automatizzato
  - Push su main → build Docker → deploy sulla VPS (via SSH o webhook)
  - Free tier generoso per repo privati (2.000 minuti/mese)

### Testing

- **Vitest** — unit e integration test
- **Playwright** — E2E test (riusato anche per automazione AdE)

### Monorepo (se necessario)

- **Turborepo** — per separare packages (app, shared, etc.)

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

### Perché Umami per analytics?

- Self-hosted gratis (nessun costo aggiuntivo, gira sulla stessa VPS)
- GDPR compliant by design, nessun cookie → nessun banner cookie
- Stesso stack tecnologico (Next.js + PostgreSQL)
- Script leggero (~2 KB), non impatta le performance

## Competitor analizzati

| Nome | Modello | Note |
|---|---|---|
| CassApp / MyCassa | App nativa (iOS/Android) + Web | By Mysond, integrazione SumUp |
| MyScontrino | App + Web | Da €79/anno, canone fisso |
| Billy | Web + SmartPOS | All-in-one con pagamenti |
| DataCash | API per sviluppatori | Anche app propria |
| Scontrinare | Web app | |

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

| Voce | Costo |
|---|---|
| VPS (già pagata) | €0 aggiuntivi |
| Cloudflare Tunnel (già attivo) | €0 |
| Supabase Cloud free tier | €0 |
| Resend free tier (3k email/mese) | €0 |
| Sentry free tier | €0 |
| Umami self-hosted | €0 |
| GitHub Actions free tier | €0 |
| Stripe | 1.5% + €0.25 per transazione |
| Dominio | ~€10/anno |
| **Totale fisso mensile** | **~€0** (solo costi variabili Stripe) |

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
- [Effatta API (riferimento competitor)](https://effatta.it/scontrino-elettronico/)
- [DataCash API (riferimento competitor)](https://datacash.it/api-developer/)
