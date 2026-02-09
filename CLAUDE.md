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

### Deployment

- **Docker self-hosted su VPS** (infrastruttura già disponibile)
  - Next.js in modalità `standalone` (output ottimizzato per container)
  - **Caddy** come reverse proxy (HTTPS automatico via Let's Encrypt)
  - Docker Compose per orchestrazione
- **Supabase Cloud** per il database (free tier, nessun DB da gestire sulla VPS)
- NO Vercel (il piano Hobby vieta uso commerciale; Pro costa $20/mese non necessario)

### Testing

- **Vitest** — unit e integration test
- **Playwright** — E2E test (riusato anche per automazione AdE)

### Monorepo (se necessario)

- **Turborepo** — per separare packages (app, shared, etc.)

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

### Perché Docker self-hosted?

- VPS già pagata → costo marginale zero
- Vercel Hobby vieta uso commerciale
- Pieno controllo su infrastruttura, log, scaling
- Caddy gestisce HTTPS automaticamente
- Docker Compose rende il deploy riproducibile
- Next.js standalone mode produce container leggeri (~100MB)

### Perché Stripe?

- Fee più basse in EU: 1.5% + €0.25 (vs 5% + $0.50 di Paddle/LemonSqueezy)
- Payout in 2 giorni su conto italiano (€0.30 per payout, nessuna fee cross-border)
- API eccellente, documentazione perfetta
- Stripe Billing per gestione abbonamenti
- Il target è solo Italia inizialmente → VAT semplice, non serve un MoR
- Se in futuro si espande all'estero, si può migrare a Paddle come MoR

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
│   ├── app/                # Next.js App Router (pages, layouts)
│   ├── components/         # Componenti React (shadcn/ui + custom)
│   │   └── ui/             # shadcn/ui components
│   ├── lib/                # Utility, client Supabase, helpers
│   │   └── ade/            # Modulo integrazione Agenzia delle Entrate
│   ├── server/             # Server actions, business logic
│   └── types/              # TypeScript types/interfaces
├── public/                 # Static assets, PWA manifest, icons
├── supabase/               # Migrazioni DB, seed, config
├── tests/                  # Test Vitest + Playwright
├── docker/                 # Dockerfile, docker-compose.yml, Caddyfile
├── CLAUDE.md
├── README.md
└── LICENSE.md
```

## Costi stimati (fase iniziale)

| Voce | Costo |
|---|---|
| VPS (già pagata) | €0 aggiuntivi |
| Supabase Cloud free tier | €0 |
| Stripe | 1.5% + €0.25 per transazione |
| Dominio | ~€10/anno |
| **Totale fisso mensile** | **~€0** (solo costi variabili Stripe) |

## Risorse e riferimenti

- [AdE — Documento Commerciale Online](https://www.agenziaentrate.gov.it/portale/se-si-utilizza-la-procedura-documento-commerciale-online)
- [Interpello AdE n. 956-1523/2020 (base legale)](https://www.my-cassa.it/wp-content/uploads/Interpello_CassApp.pdf)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js Docker + Caddy deploy](https://emirazazi.de/blog/nextjs-vps-deployment/)
- [shadcn/ui docs](https://ui.shadcn.com/)
- [Supabase docs](https://supabase.com/docs)
- [Drizzle ORM docs](https://orm.drizzle.team/)
- [Stripe Italia pricing](https://stripe.com/pricing)
- [Effatta API (riferimento competitor)](https://effatta.it/scontrino-elettronico/)
- [DataCash API (riferimento competitor)](https://datacash.it/api-developer/)
