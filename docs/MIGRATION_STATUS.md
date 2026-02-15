# ScontrinoZero — Stato progetto per migrazione repo

Documento creato per consentire la ripresa del lavoro dopo la ricreazione del repository.

## Motivo migrazione

Credenziali Fisconline pushate accidentalmente nei file HAR (`docs/login_fol.har`, `docs/auth_failed.har`) su repo pubblico. Password già cambiata. Repo cancellato e ricreato senza i file HAR.

---

## Fase completate

### Phase 0 — Foundation (COMPLETATA)

- **Next.js 16** con App Router, TypeScript strict, Tailwind CSS 4
- **shadcn/ui** radix-nova (compact), teal theme, Nunito Sans font (local woff2)
- **ESLint + Prettier** con lint-staged + husky (pre-commit hooks)
- **Vitest** con coverage v8, vitest-sonar-reporter
- **SonarQube Cloud** integrato (sonar-project.properties + CI step)
- **Docker** standalone + docker-compose con cloudflared
- **GitHub Actions CI** (lint + typecheck + test + coverage + sonar + build)
- **GitHub Actions Deploy** (tag-based: `v*.*.*-test` → test, `v*.*.*` → prod)
- **Dependabot** (settimanale, patch/minor raggruppati)
- **Health check** endpoint `/api/health`
- **Playwright E2E** (Chromium desktop + Pixel 7 mobile, CI job separato)
- **Supabase + Drizzle ORM** (schema profiles + businesses + waitlist + relations)
- **VPS deploy** funzionante (cron polling + docker exec)

### Phase 1A — Security hotspot + TDD (COMPLETATA)

- `src/lib/validation.ts` — `isValidEmail()` lineare (no regex backtracking)
- `src/lib/validation.test.ts` — 13 test TDD
- `src/app/api/waitlist/route.test.ts` — 7 test con mock Drizzle
- `src/app/api/waitlist/route.ts` — usa `isValidEmail()` al posto del regex
- **23 test totali** (13 validation + 7 route + 3 utils)
- SonarCloud issues risolte: readonly props, deprecated FormEvent, deprecated Github icon, @custom-variant CSS

### Phase 2 — AdE spike: analisi (IN CORSO)

Analisi completata. Documenti di riferimento:

- `docs/ANALYSIS_CHECKPOINT.md` — analisi consolidata flusso completo
- `docs/documento-commerciale-api-json.md` — specifiche API JSON dettagliate
- File C# di riferimento: `docs/Send.cs`, `docs/DC.cs`, `docs/Esiti.cs`
- `docs/scontrinorapidoapiswagger.json` — Swagger esterno di riferimento
- `docs/examplejson.md` — payload di esempio
- `docs/aliquote_iva.md` — codifiche IVA/natura

**Prossimo step**: implementazione modulo `src/lib/ade/` in TypeScript.

---

## Struttura file del progetto (da mantenere)

```
scontrinozero/
├── .github/workflows/ci.yml, deploy.yml
├── docs/
│   ├── ANALYSIS_CHECKPOINT.md     ← analisi AdE
│   ├── documento-commerciale-api-json.md
│   ├── examplejson.md
│   ├── aliquote_iva.md
│   ├── DC.cs, Send.cs, Esiti.cs   ← riferimento C#
│   ├── scontrinorapidoapiswagger.json
│   ├── DocumentoCommerciale.csproj, .sln
│   ├── 151247931_vendita.pdf       ← esempio PDF
│   └── 151248248_annullamento.pdf
├── e2e/landing.spec.ts
├── playwright.config.ts
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx            ← landing single-page con anchor
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   └── waitlist/
│   │   │       ├── route.ts
│   │   │       └── route.test.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── marketing/
│   │   │   ├── header.tsx          ← nav con anchor (#funzionalita, #prezzi)
│   │   │   ├── footer.tsx
│   │   │   └── waitlist-form.tsx
│   │   └── ui/                     ← shadcn/ui (esclusi da coverage)
│   ├── db/
│   │   ├── index.ts
│   │   ├── index.test.ts
│   │   └── schema/
│   │       ├── index.ts
│   │       ├── profiles.ts
│   │       ├── businesses.ts
│   │       ├── waitlist.ts
│   │       └── relations.ts
│   ├── fonts/                      ← NunitoSans, GeistMono (woff2 locali)
│   └── lib/
│       ├── utils.ts
│       ├── utils.test.ts
│       ├── validation.ts
│       └── validation.test.ts
├── tests/setup.ts
├── vitest.config.ts
├── CLAUDE.md
├── PLAN.md
├── ROADMAP.md
├── drizzle.config.ts
├── docker-compose.yml
├── Dockerfile
├── .dockerignore
├── .env.example
├── sonar-project.properties
└── tsconfig.json (exclude: playwright.config.ts, e2e)
```

## File da NON includere nel nuovo repo

- `docs/*.har` — contengono dati sensibili (credenziali, cookie, P.IVA, CF)
- `vendita.har`, `annullo.har` (root) — stessi file HAR vecchi
- Qualsiasi file con credenziali reali

---

## Configurazione chiave

### shadcn/ui

- Style: `radix-nova` (compact)
- Theme: teal
- Font: Nunito Sans (locale, `src/fonts/`)

### tsconfig.json

- `exclude: ["node_modules", "playwright.config.ts", "e2e"]`

### vitest.config.ts

- Coverage: esclusi `src/components/ui/`
- Reporter: `vitest-sonar-reporter` per SonarCloud

### Docker

- `output: 'standalone'` in next.config.ts
- Base image: node slim
- Logging limits: `max-size: 10m`, `max-file: 3`

### CI/CD

- Smart skip: analizza diff, salta se solo `.md` o `static/`
- E2E: job separato, solo se file rilevanti cambiano
- Deploy: tag `v*.*.*-test` → test, `v*.*.*` → prod

### Deploy VPS

- Raspberry Pi con Docker + code-server
- Cloudflare Tunnel: `sz.9874848.xyz` → localhost:3000
- Cron polling deploy script con `docker exec code-server bash -lc "..."`
- pm2 per process management dentro container

---

## Roadmap (sequenza fasi)

```
0 ✅ → 1A ✅ → 2 🔵 (AdE spike) → 1B (landing completa) → 3A (security infra)
→ 3B (auth) → 4 (MVP) → 5 (PWA) → 6 (stabilità) → 7 (Stripe) → 8 (lancio)
```

Dettagli in `PLAN.md` e `ROADMAP.md`.

---

## Riepilogo AdE (per non perdere l'analisi)

### Flusso autenticazione Fisconline (6 fasi)

1. `GET /portale/web/guest` — init cookie jar
2. `POST /portale/home?..._58_struts_action=/login/login` — login (CF + password + PIN)
3. `GET /dp/api?v={ts}` — bootstrap sessione
4. `POST /portale/scelta-utenza-lavoro?p_auth={token}&...` — seleziona P.IVA
5. `GET /ser/api/fatture/v1/ul/me/adesione/stato/` — verifica sessione READY
6. `POST /ser/api/documenti/v1/doc/documenti/?v={ts}` — invio documento

### Endpoint API AdE

- `POST /ser/api/documenti/v1/doc/documenti/` — emissione vendita/annullo
- `GET /ser/api/documenti/v1/doc/documenti/` — ricerca con filtri
- `GET /ser/api/documenti/v1/doc/documenti/{idtrx}/` — dettaglio
- `GET /ser/api/documenti/v1/doc/documenti/{idtrx}/stampa/?regalo={bool}` — PDF
- `GET /ser/api/documenti/v1/doc/documenti/dati/fiscali` — dati fiscali
- `GET/POST/PUT/DELETE /ser/api/documenti/v1/doc/rubrica/prodotti` — rubrica

### Formato payload

- `datiTrasmissione.formato`: `"DCW10"`
- Importi: stringhe con 2 decimali (`"2.01"`)
- Date: `"dd/MM/yyyy"`
- IVA: `4`, `5`, `10`, `22`, `N1`-`N6`
- Pagamenti: `PC` (contanti), `PE` (elettronico), `TR` (ticket)
- Annullo: aggiunge `idtrx` root + `resoAnnullo` + niente `vendita[]`

### Login fallito vs riuscito

- Entrambi 302. Differenza: Location → `/portale/c` (ok) vs `/portale/home?p_p_id=58...` (fail)
- Verificare `isSignedIn` nella pagina o probe API con 200

---

## Procedura per il nuovo repo

1. Crea nuovo repo `scontrinozero` su GitHub (pubblico)
2. Copia tutti i file tranne `docs/*.har`, `vendita.har`, `annullo.har`
3. Primo commit con tutto il codice
4. Verifica CI passa
5. Aggiungi i secrets Supabase nelle GitHub Actions settings
6. Riprendi sviluppo da Phase 2 (implementazione `src/lib/ade/`)
