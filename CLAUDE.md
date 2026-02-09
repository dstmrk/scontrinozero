# CLAUDE.md — ScontrinoZero

## Progetto

ScontrinoZero è un registratore di cassa virtuale (SaaS) mobile-first che consente a
esercenti e micro-attività di emettere scontrini elettronici e trasmettere i corrispettivi
all'Agenzia delle Entrate senza registratore telematico fisico, sfruttando la procedura
"Documento Commerciale Online".

## Tech Stack (in definizione)

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
| **Supabase** | BaaS (PostgreSQL) | DB, auth interna, storage, realtime |

### Database

- **PostgreSQL** via Supabase
- **Drizzle ORM** — type-safe, leggero, ottima DX con TypeScript
- **Row Level Security (RLS)** — sicurezza a livello di riga per multi-tenancy

### Autenticazione

- **Supabase Auth** — gestione sessioni app (email/password, magic link)
- **SPID/CIE (OIDC)** — da valutare per login utente e/o collegamento al portale AdE
  - SDK ufficiale: `spid-cie-oidc-nodejs` (Developers Italia)
  - Flusso: Authorization Code Flow + PKCE

### Integrazione Agenzia delle Entrate

L'AdE **non espone API REST pubbliche**. Opzioni:

1. **API di terze parti** (raccomandato per MVP):
   - **DataCash** (datacash.it) — API REST, fiscalizzazione differita via webhook, PDF
   - **Effatta** (effatta.it) — API REST, sandbox disponibile
2. **Integrazione diretta** (futura, più complessa):
   - Richiede gestione credenziali Fisconline dell'utente
   - Più autonomia ma maggiore complessità

### Pagamenti SaaS (subscription)

- **Stripe** — gestione abbonamenti, fatturazione ricorrente, webhook

### Deployment

- **Vercel** — deploy Next.js (free tier per start, poi Pro ~$20/mese)
- Alternativa: **Docker + Fly.io / Railway** per più controllo

### Testing

- **Vitest** — unit e integration test
- **Playwright** — E2E test

### Monorepo (se necessario)

- **Turborepo** — per separare packages (app, shared, etc.)

## Decisioni architetturali

### Perché Next.js e non solo React (SPA)?

- SSR per SEO (landing page, marketing)
- Server Actions/API Routes eliminano bisogno di backend separato
- Ecosystem maturo, standard de facto per React SaaS
- Ottimo supporto PWA

### Perché Supabase e non Firebase?

- PostgreSQL standard (no vendor lock-in)
- Open source, self-hostable
- Pricing prevedibile (free tier generoso: 50k MAU, 500MB DB)
- RLS nativo per multi-tenancy
- Migrazione facile verso qualsiasi PostgreSQL host

### Perché PWA e non app nativa?

- Un solo codebase per mobile + desktop
- Nessun costo App Store / Play Store
- Installabile su home screen
- Aggiornamenti istantanei (no review store)
- Il target (micro-attività) preferisce semplicità
- Si può valutare Capacitor/Expo in futuro se servono feature native

### Perché shadcn/ui?

- Componenti belli e accessibili out-of-the-box
- Completamente customizzabili (copia nel progetto, non dipendenza)
- Basato su Radix UI (accessibilità) + Tailwind CSS
- Design minimale, perfetto per UX mobile-first
- Grande community e ecosystem

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
│   ├── app/            # Next.js App Router (pages, layouts)
│   ├── components/     # Componenti React (shadcn/ui + custom)
│   │   └── ui/         # shadcn/ui components
│   ├── lib/            # Utility, client Supabase, helpers
│   ├── server/         # Server actions, business logic
│   └── types/          # TypeScript types/interfaces
├── public/             # Static assets, PWA manifest
├── supabase/           # Migrazioni DB, seed, config
├── tests/              # Test Vitest + Playwright
├── CLAUDE.md           # Questo file
├── README.md
└── LICENSE.md
```

## Risorse e riferimenti

- [Developers Italia — SPID](https://developers.italia.it/it/spid/)
- [SPID/CIE OIDC Regole Tecniche](https://docs.italia.it/italia/spid/spid-cie-oidc-docs/it/versione-corrente/)
- [SDK Node.js SPID/CIE OIDC](https://github.com/italia/spid-cie-oidc-nodejs)
- [AdE — Documento Commerciale Online](https://www.agenziaentrate.gov.it/portale/se-si-utilizza-la-procedura-documento-commerciale-online)
- [DataCash API](https://datacash.it/api-developer/)
- [Effatta API](https://effatta.it/scontrino-elettronico/)
- [Interpello AdE n. 956-1523/2020 (base legale)](https://www.my-cassa.it/wp-content/uploads/Interpello_CassApp.pdf)
- [shadcn/ui docs](https://ui.shadcn.com/)
- [Next.js docs](https://nextjs.org/docs)
- [Supabase docs](https://supabase.com/docs)
- [Drizzle ORM docs](https://orm.drizzle.team/)
