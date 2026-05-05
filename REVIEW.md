# Code Review — ScontrinoZero
<!-- STATE: in_progress -->
<!-- LAST_PASS: 2 -->
<!-- LAST_AREA_COMPLETED: src/app + src/server + supabase -->
<!-- NEXT_AREA_TO_SCAN: src/lib (Pass 3 architettura) -->
<!-- AREAS_REMAINING: src/lib, src/components, scripts, tests, config-infra (Pass 3) -->

## Findings (ordinati per priorità)
<!-- I finding vengono aggiunti incrementalmente, mai persi -->

### [P3] UUID non validato a route boundary su `/r/[documentId]/pdf`
- **Categoria**: sicurezza
- **File**: `src/app/r/[documentId]/pdf/route.ts:31-33`
- **Problema**: `documentId` viene estratto dai params e passato direttamente a `fetchPublicReceipt(documentId)` senza chiamata a `isValidUuid()`. Viola la regola 18 di CLAUDE.md ("Every external-facing API route that accepts a UUID parameter must validate the format with `isValidUuid()` and return 400 before passing to any service or DB layer"). Le altre route equivalenti (`src/app/api/v1/receipts/[id]/route.ts`) eseguono già la validazione UUID a boundary.
- **Impatto**: una stringa malformata (es. `"' OR 1=1 --"`) genera un 500 PostgreSQL "invalid input syntax for type uuid" anziché un 400/404 controllato. Bypass dei middleware applicativi di gestione errori (logging, Sentry rumoroso). Inconsistenza di superficie API. Nessun data leak diretto.
- **Fix proposto**: in `src/app/r/[documentId]/pdf/route.ts` dopo `const { documentId } = await params;` aggiungere:
  ```ts
  import { isValidUuid } from "@/lib/uuid";
  if (!isValidUuid(documentId)) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }
  ```
  Allineare anche `src/app/r/[documentId]/page.tsx` se non già coperto.
- **Test da aggiungere**: in `tests/unit/` o co-located: GET con `documentId="not-a-uuid"` ritorna 404 (non 500) e non chiama `fetchPublicReceipt` (mock che lancerebbe).
- **Trovato in passata**: 1

### [P3] CHECK constraint mancanti su colonne `numeric` per importi/quantità
- **Categoria**: sicurezza (defense in depth) / funzionalità
- **File**: `supabase/migrations/0000_initial.sql:74-75,84` (schema esistente) + `src/db/schema/*.ts`
- **Problema**: le colonne `commercial_document_lines.quantity numeric(10,3)`, `commercial_document_lines.gross_unit_price numeric(10,2)` e `catalog_items.default_price numeric(10,2)` non hanno `CHECK (... >= 0)`. La validazione attuale è solo applicativa (Zod refines + business logic in `receipt-actions`). Se un giorno una rotta dimentica il refine, o se una migrazione di import legacy bypassa Zod, il DB accetta valori negativi che generano scontrini AdE coerenti dal punto di vista syntax ma con totali invertiti.
- **Impatto**: defense-in-depth mancante. Possibile inserimento di scontrini con totale negativo (rimborso non autorizzato, contabilità inversa) se un percorso applicativo non valida. Bassa probabilità ma prevenzione gratuita a livello DB.
- **Fix proposto**: nuova migrazione `supabase/migrations/0014_numeric_check_constraints.sql` con:
  ```sql
  ALTER TABLE commercial_document_lines
    ADD CONSTRAINT cd_lines_quantity_non_negative CHECK (quantity >= 0);
  ALTER TABLE commercial_document_lines
    ADD CONSTRAINT cd_lines_gross_unit_price_non_negative CHECK (gross_unit_price >= 0);
  ALTER TABLE catalog_items
    ADD CONSTRAINT catalog_items_default_price_non_negative CHECK (default_price IS NULL OR default_price >= 0);
  ```
  Aggiornare `_journal.json` come da regola 14 di CLAUDE.md.
- **Test da aggiungere**: integration test che tenta `INSERT` con valore negativo e verifica che il DB risponda `23514 check_violation`. In alternativa, un test che esegue la migrazione e verifica `pg_constraint` per la presenza dei vincoli.
- **Trovato in passata**: 1

### [P3] `JSON.stringify` in `<script type="application/ld+json">` non escapa `</script>` (XSS futuro su route dinamiche)
- **Categoria**: sicurezza (defense in depth)
- **File**: `src/components/json-ld.tsx:8`
- **Problema**: `<script ... dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}>` inietta il JSON-LD nel DOM senza escape di `<`/`>`/`&`. Oggi tutti i `data` sono statici (`softwareApplicationJsonLd`, `organizationJsonLd`, `breadcrumbListJsonLd` chiamato con costanti). Le release roadmap v1.2.9-v1.2.13 introdurranno route dinamiche `/per/[slug]`, `/guide/[slug]`, `/confronto/[slug]` che probabilmente passeranno parti dello slug nel JSON-LD. Se anche solo uno di questi parametri arriva da un input utente o da contenuto editoriale non controllato, una stringa contenente `</script>` chiude prematuramente il tag e permette XSS riflesso.
- **Impatto**: nullo oggi; rischio elevato non appena si introducono campi user-controllable nel JSON-LD (es. `aggregateRating` con review degli utenti pianificato in v1.2.14, `Service` per landing categoria con descrizioni editoriali, ecc.). Senza escape preventivo, è facile dimenticare di sanitizzare in ogni punto di chiamata.
- **Fix proposto**: in `src/components/json-ld.tsx:8` sostituire con escape sicuro:
  ```tsx
  const safe = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safe }} />;
  ```
  Estendere il fix prima di v1.2.9 quando arriveranno le route dinamiche.
- **Test da aggiungere**: in `src/components/json-ld.test.tsx`: chiamare `JsonLd` con `data = { name: "</script><script>alert(1)</script>" }` e assert che il `__html` contenga `</script>` (non la sequenza letterale).
- **Trovato in passata**: 1

### [P3] CF-Connecting-IP mancante in produzione: `logger.warn` non triggera Sentry
- **Categoria**: sicurezza (osservabilità)
- **File**: `src/lib/get-client-ip.ts:33-36`
- **Problema**: in `getClientIp()`, quando `cf-connecting-ip` è assente in produzione, viene loggato a `logger.warn(...)`. Il logger pino in `src/lib/logger.ts:134` ha `PINO_ERROR_LEVEL = 50` e il `logMethod` hook chiama `captureToSentry` solo su `level >= 50`. Pino `warn` è level 40, quindi **non** finisce in Sentry. La misconfiguration di Cloudflare Tunnel — che farebbe condividere il bucket "unknown" a tutto il traffico, neutralizzando il rate limit per-IP — sarebbe visibile solo nei log di stdout del container, senza alert su Sentry.
- **Impatto**: silent degradation del rate limiting per-IP. Senza alert su Sentry, ops potrebbe accorgersene solo dopo un'ondata di abuso (account takeover, brute force su login, scraping).
- **Fix proposto**: in `src/lib/get-client-ip.ts` promuovere a `logger.error({ critical: true }, ...)` (campo già nella SAFE_KEYS allowlist di `sanitizeForTelemetry`). Eventualmente throttle dell'errore (sample rate ≤ 1/min) per evitare flooding di Sentry. Snippet:
  ```ts
  if (process.env.NODE_ENV === "production") {
    logger.error({ critical: true }, "CF-Connecting-IP header missing in production — Cloudflare misconfiguration?");
    return "unknown";
  }
  ```
- **Test da aggiungere**: in `src/lib/get-client-ip.test.ts`, aggiungere caso con `vi.stubEnv("NODE_ENV", "production")`, mock di `logger.error`, verificare che venga chiamato con `{ critical: true }` e che il return sia "unknown".
- **Trovato in passata**: 1

### [P2] Stripe Price ID env var con fallback silenzioso a stringa vuota
- **Categoria**: sicurezza (configurazione) / funzionalità
- **File**: `src/lib/stripe.ts:55-68`
- **Problema**: i 4 getter di `PRICE_IDS` (`starterMonthly`, `starterYearly`, `proMonthly`, `proYearly`) usano il pattern `process.env.STRIPE_PRICE_X ?? ""`. Se una di queste env var manca o è vuota in produzione (deploy mal configurato, secret rotation parziale, refactor del compose), il getter restituisce `""` invece di lanciare. `isValidPriceId("")` ritorna `false`, `planFromPriceId("")` ritorna `null`, e il checkout fallisce a runtime con errore generico al primo utente che tenta l'upgrade. Nessun fail-fast all'avvio del container — il problema si manifesta solo al primo checkout.
- **Impatto**: revenue loss silenzioso. Nessun alert su Sentry finché un utente non tenta checkout (potenzialmente ore/giorni dopo il deploy). Debug difficile perché l'errore client è generico ("Servizio temporaneamente non disponibile") e non c'è log strutturato di "STRIPE_PRICE_* missing".
- **Fix proposto**: in `src/lib/stripe.ts` sostituire i 4 getter con una funzione che valida una volta sola e fa fail-fast all'import:
  ```ts
  function requirePriceEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing required env var ${name}`);
    return v;
  }
  // popolato lazily al primo accesso ma con throw esplicito
  export const PRICE_IDS = {
    get starterMonthly() { return requirePriceEnv("STRIPE_PRICE_STARTER_MONTHLY"); },
    // … idem per gli altri 3
  } as const;
  ```
  In alternativa: validare i 4 valori in `instrumentation.ts` (o `register()` startup hook) e crashare il processo prima che il container risulti `healthy`. Aggiornare anche `instrumentation.ts` o lo healthcheck `/api/health/ready` per riflettere la dipendenza.
- **Test da aggiungere**: in `src/lib/stripe.test.ts` (creare se assente): test che `delete process.env.STRIPE_PRICE_STARTER_MONTHLY; expect(() => PRICE_IDS.starterMonthly).toThrow(/STRIPE_PRICE_STARTER_MONTHLY/)`. Usare `vi.stubEnv` per non leakare tra test.
- **Trovato in passata**: 1

### [P2] GitHub Actions non pinnate a commit SHA (supply chain risk)
- **Categoria**: sicurezza (supply chain)
- **File**: `.github/workflows/ci.yml:22,55,153,170-180` + `.github/workflows/deploy.yml:72,80,83,212,219` + `.github/workflows/scheduled-audit.yml:13-15` + `.github/workflows/claude*.yml:23-54`
- **Problema**: tutte le action third-party sono pinnate a tag mutabili (es. `actions/checkout@v6`, `gitleaks/gitleaks-action@v2`, `SonarSource/sonarqube-scan-action@v7`, `docker/build-push-action@v7`, `aquasecurity/trivy-action@v0.35.0`, `anthropics/claude-code-action@v1.0.102`). Un tag — anche un patch tag come `@v0.35.0` — può essere force-pushato sull'upstream se l'action publisher viene compromessa. Le action di terze parti vengono eseguite con accesso al `GITHUB_TOKEN`, quindi una compromissione consente di iniettare codice malevolo nel build, leakare secret (GHCR push token, Sonar token, SENTRY_AUTH_TOKEN, ecc.) o pubblicare immagini compromesse su GHCR.
- **Impatto**: account/secret takeover via supply-chain attack. Il blast radius include push su GHCR (immagini Docker per produzione + sandbox), accesso al token Sonar/Sentry/Cloudflare, e potenziale RCE sui runner. CWE-829 (Inclusion of Functionality from Untrusted Control Sphere). Standard SLSA L3 richiede pin a SHA full-length per tutte le action non first-party.
- **Fix proposto**:
  1. Per ogni `uses: <owner>/<repo>@v*` non-`actions/*` first-party (anche `actions/*` è raccomandato), sostituire con SHA full a 40 caratteri + commento di versione:
     ```yaml
     - uses: gitleaks/gitleaks-action@<sha>  # v2.x
     - uses: SonarSource/sonarqube-scan-action@<sha>  # v7
     - uses: docker/build-push-action@<sha>  # v7
     - uses: aquasecurity/trivy-action@<sha>  # v0.35.0
     - uses: anthropics/claude-code-action@<sha>  # v1.0.102
     ```
     Recuperare ogni SHA da `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` e committare in un'unica passata.
  2. Abilitare Dependabot per `.github/workflows/` (gruppo `github-actions`) — esiste già la config Dependabot per npm; estenderla a actions con update settimanale.
  3. Aggiungere step CI di lint che fallisce se `grep -E 'uses: [^ ]+@(v[0-9]|main|master|latest)' .github/workflows/*.yml` trova match (esclusi `actions/checkout` e altri first-party trusted via allowlist esplicita).
- **Test da aggiungere**: script `scripts/check-action-pins.mjs` che parsea i workflow YAML e fallisce su pattern `@v*` o `@main` per action non whitelisted; integrare in CI come step lint nel job `lint`.
- **Trovato in passata**: 1

### [P3] Length constraint mancanti su colonne `text` user-controlled
- **Categoria**: sicurezza (defense in depth) / performance
- **File**: `supabase/migrations/0000_initial.sql:9,13,17,25-32,73,83` + `src/db/schema/*.ts`
- **Problema**: campi `text` come `profiles.email`, `commercial_document_lines.description`, `catalog_items.description`, `businesses.business_name`, `businesses.address` non hanno `CHECK (length(col) <= N)`. La validazione di lunghezza è solo applicativa (Zod). Un percorso che dimentica il refine o una INSERT diretta possono memorizzare megabyte di testo, causando bloat di tabella, slowdown su SELECT a scansione e payload AdE giganti.
- **Impatto**: storage inflation, query slow per indice/heap miss, potenziale 413/timeout downstream verso AdE quando il documento viene rispedito.
- **Fix proposto**: nuova migrazione `supabase/migrations/0015_text_length_constraints.sql` con limiti coerenti con i refines Zod attuali (verificare `src/lib/validation.ts` e `src/server/*-actions.ts` per i max). Esempio:
  ```sql
  ALTER TABLE profiles ADD CONSTRAINT profiles_email_len CHECK (char_length(email) <= 254);
  ALTER TABLE commercial_document_lines
    ADD CONSTRAINT cd_lines_description_len CHECK (char_length(description) <= 1000);
  ALTER TABLE catalog_items
    ADD CONSTRAINT catalog_items_description_len CHECK (char_length(description) <= 500);
  ALTER TABLE businesses
    ADD CONSTRAINT businesses_name_len CHECK (business_name IS NULL OR char_length(business_name) <= 200);
  ```
  Calibrare i numeri leggendo i Zod schema effettivi prima di applicare.
- **Test da aggiungere**: per ogni constraint, INSERT con stringa oversized → assert `23514`. Test che la migrazione sia idempotente (re-run safe).
- **Trovato in passata**: 1

### [P1] `getOnboardingStatus()` chiamato 2× per ogni page load del dashboard (6 query DB invece di 3)
- **Categoria**: performance
- **File**: `src/server/onboarding-actions.ts:374-421` + `src/app/dashboard/layout.tsx:28` + `src/app/dashboard/page.tsx:11` + `src/app/dashboard/cassa/page.tsx:11` + `src/app/dashboard/storico/page.tsx:30`
- **Problema**: `getOnboardingStatus()` esegue 3 query Drizzle sequenziali con dipendenza dato (profile → business → ade_credentials, righe 378-412). La funzione viene invocata sia in `dashboard/layout.tsx:28` (parent layout RSC) sia in ogni `dashboard/<segment>/page.tsx` (cassa/page.tsx:11, storico/page.tsx:30, page.tsx:11). Per una singola navigazione a `/dashboard/cassa`, la funzione viene chiamata 2 volte → **6 round-trip DB** sequenziali (3 per layout + 3 per page) invece dei 3 minimi. React `cache()` (da `react`) non è applicato, quindi le due call non sono dedupate. Su una connessione a Supabase Cloud (RTT ~30-100ms da VPS EU), questo significa 180-600ms di latenza pura sprecata per ogni page load del dashboard.
- **Impatto**: TTFB del dashboard significativamente più lento del necessario, percepibile su mobile / connessione 4G dove ogni RTT pesa di più. Costo DB raddoppiato sulle pagine più navigate dell'app SaaS. Confligge con il principio di prodotto "performance percepita come priorità #1" in CLAUDE.md.
- **Fix proposto**: due interventi compatibili:
  1. **Deduplicare** con `cache()` di React (NON `unstable_cache` di Next): in `src/server/onboarding-actions.ts` wrappare l'export con `cache()` da `react`:
     ```ts
     import { cache } from "react";
     export const getOnboardingStatus = cache(async (): Promise<OnboardingStatus> => {
       // … corpo attuale …
     });
     ```
     `cache()` deduplicaza all'interno dello stesso render tree RSC (layout + page condividono lo stesso request), eliminando la doppia chiamata. Nota: CLAUDE.md ricorda che `cache()` non funziona tra RSC e Route Handler — qui funziona perché entrambi i caller sono RSC nello stesso request.
  2. **Single JOIN** invece di 3 query: sostituire i 3 `select()` con un'unica `LEFT JOIN`:
     ```ts
     const [row] = await db
       .select({
         profileId: profiles.id,
         businessId: businesses.id,
         credentialsVerified: adeCredentials.verifiedAt,
         hasCredentials: sql<boolean>`${adeCredentials.id} IS NOT NULL`,
       })
       .from(profiles)
       .leftJoin(businesses, eq(businesses.profileId, profiles.id))
       .leftJoin(adeCredentials, eq(adeCredentials.businessId, businesses.id))
       .where(eq(profiles.authUserId, user.id))
       .limit(1);
     ```
     Con `cache()` + JOIN: una sola query DB per page load, indipendente dal numero di RSC che chiamano `getOnboardingStatus()`.
- **Test da aggiungere**:
  1. In `src/server/onboarding-actions.test.ts`: mock `getDb()` → spy contatore di query → render simulato di layout+page → assert che `getOnboardingStatus()` interno faccia **1 query** (non 3) e che venga invocata **una sola volta** nello stesso render scope.
  2. Test che il return shape (`OnboardingStatus`) resti invariato per non regredire i caller esistenti.
- **Trovato in passata**: 2

### [P2] `getCatalogItems` carica l'intero catalogo senza LIMIT (Pro plan illimitato)
- **Categoria**: performance
- **File**: `src/server/catalog-actions.ts:79-93`
- **Problema**: la query `db.select().from(catalogItems).where(eq(catalogItems.businessId, businessId)).orderBy(asc(catalogItems.description))` non ha `LIMIT`. Per piano **Starter** il limite a 5 items è applicativo e non c'è rischio. Per piano **Pro** il catalogo è "illimitato" (`PLAN.md` "Pricing"): un business con 5.000-10.000 articoli (es. negozio di alimentari, ferramenta) carica l'intera collezione ad ogni apertura del POS / aggiunta riga. Il payload JSON serializzato cresce a 1-5 MB, allocato in memoria server-side prima del send-down RSC.
- **Impatto**: latenza UI percepita su catalogo grande (>1k items): tempo di parse JSON RSC + render della Combobox prodotti supera 1s. Memoria heap del processo Node cresce a ogni richiesta (visibile come spike GC su Sentry performance). NON è coperto da B2 (B2 traccia paginazione cursor solo per `searchReceipts` / `exportUserData` / Developer API — non per il catalogo, che è un endpoint UI-driven differente).
- **Fix proposto**: introdurre paginazione + ricerca server-side, oppure per il caso "POS dropdown" caricare solo i top-N items per uso recente.
  ```ts
  export async function getCatalogItems(
    businessId: string,
    opts: { limit?: number; offset?: number; q?: string } = {},
  ): Promise<CatalogItem[]> {
    const limit = Math.min(opts.limit ?? 200, 500);
    const offset = opts.offset ?? 0;
    const filter = opts.q
      ? and(eq(catalogItems.businessId, businessId), ilike(catalogItems.description, `%${opts.q}%`))
      : eq(catalogItems.businessId, businessId);
    // … select con .limit(limit).offset(offset)
  }
  ```
  L'UI POS deve passare a un autocomplete server-side (debounced search) invece del dropdown full-list. Per la pagina `/dashboard/catalogo` introdurre paginazione UI a 50/pag.
- **Test da aggiungere**:
  1. In `src/server/catalog-actions.test.ts` (esistente): seed 250 items in mock DB → assert che default `limit` ritorni max 200 e che `q="filtro"` applichi `ilike`.
  2. Test che `limit > 500` venga clampato a 500.
- **Trovato in passata**: 2

### [P3] Marketing homepage: CTA primario "Inizia gratis" con `prefetch={false}`
- **Categoria**: performance
- **File**: `src/app/(marketing)/page.tsx:51`
- **Problema**: il CTA principale del funnel di conversione (`<Link href="/register" prefetch={false}>`) disabilita esplicitamente il prefetch automatico di Next.js. Per default i `<Link>` visibili nel viewport vengono prefetchati: `/register` (auth route group) verrebbe pre-caricato non appena l'utente vede il bottone, riducendo il TTFB percepito al click. Con `prefetch={false}` l'utente attende l'intero round-trip RSC al click. Su mobile 4G questo aggiunge 300-800ms perceivable al tempo di apertura della pagina di registrazione, esattamente nel momento più critico della conversione.
- **Impatto**: friction sul funnel di conversione principale. Nessun beneficio concreto del `prefetch={false}` qui — la decisione potrebbe essere stata copiata da una linea guida per link verso route protette in dashboard (dove ha senso evitare prefetch RSC autenticato), ma `/register` è una pagina pubblica leggera.
- **Fix proposto**: rimuovere l'attributo (default `prefetch={null}` in Next 15+ è "viewport prefetch"). Verificare in parallelo gli altri CTA in `(marketing)/page.tsx` (header, sezioni intermedie, footer) e su `/funzionalita`, `/prezzi` per applicare lo stesso fix dove pertinente.
- **Test da aggiungere**: snapshot test del componente `<HomePage />` che assert `getByRole('link', { name: /inizia gratis/i }).getAttribute('data-prefetch')` non sia "false". In alternativa: e2e test che il navigation a `/register` sia <100ms da viewport-visible (richiede setup Playwright; in alternativa misurare manualmente con Lighthouse).
- **Trovato in passata**: 2

### [P3] Indice composito mancante su `api_keys (business_id, revoked_at)` per lookup chiavi attive
- **Categoria**: performance
- **File**: `src/db/schema/api-keys.ts:58-60` + `supabase/migrations/0004_add_api_keys.sql:25-27`
- **Problema**: `listApiKeys()` (`src/server/api-key-actions.ts:39-49`) e altri caller filtrano su `WHERE business_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`. Lo schema ha tre indici single-column (`idx_api_keys_key_hash`, `idx_api_keys_profile_id`, `idx_api_keys_business_id`) ma nessun indice composito `(business_id, revoked_at)`. Postgres usa `idx_api_keys_business_id` come accesso primario e poi filtra `revoked_at IS NULL` in heap-fetch. Oggi il piano consente max 1 chiave attiva per business (B12 traccia la race condition), quindi la cardinalità è 1-2 righe per business e l'indice composito non sposta misurabilmente la query. Il finding diventa rilevante quando si introdurranno **piani Developer multi-key** (roadmap v2.0.0 "Developer API Fase B: piani developer, multi-operatore" in PLAN).
- **Impatto**: oggi nullo (low cardinality), futuro: con piani che permettono 10-50 chiavi per business e tabella che cresce a 10k+ chiavi totali, la query passa da index-only-scan a index+heap-filter (10-30 ms aggiuntivi). Nessun impatto correttezza.
- **Fix proposto**: nuova migrazione `supabase/migrations/0014_api_keys_business_revoked_index.sql`:
  ```sql
  CREATE INDEX idx_api_keys_business_revoked
    ON api_keys (business_id, revoked_at)
    WHERE revoked_at IS NULL;
  -- Partial index su NULL: massima compattezza, query plan ottimale.
  -- Se serve anche per .where(...isNotNull(revoked_at)) (audit), sostituire con full index.
  ```
  Aggiornare `_journal.json` come da regola 14 di CLAUDE.md. **Da rimandare al PR di v2.0.0 (Developer API Fase B)** — applicarlo ora aggiunge complessità di migrazione senza beneficio misurabile sui workload attuali.
- **Test da aggiungere**: integration test `EXPLAIN (FORMAT JSON) SELECT … WHERE business_id = $1 AND revoked_at IS NULL` che verifica `Index Cond: ((business_id = $1) AND (revoked_at IS NULL))` e plan = `Index Only Scan` (non `Index Scan` + `Filter`).
- **Trovato in passata**: 2

