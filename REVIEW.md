# Code Review — ScontrinoZero
<!-- STATE: in_progress -->
<!-- LAST_PASS: 4 -->
<!-- LAST_AREA_COMPLETED: all areas (Pass 4 bad practice complete) -->
<!-- NEXT_AREA_TO_SCAN: — (final polish + close out) -->
<!-- AREAS_REMAINING: none (all 4 passes done) -->

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

### [P2] `signUp` normalizza l'email inline invece di usare `normalizeEmail()` (drift risk)
- **Categoria**: architettura / bad practice
- **File**: `src/server/auth-actions.ts:175`
- **Problema**: `signUp` esegue `const email = rawEmail?.trim().toLowerCase() ?? "";` direttamente, mentre `signIn` (riga 248), `signInWithMagicLink` (307) e `resetPassword` (337) usano l'helper centralizzato `normalizeEmail()` da `@/lib/validation`. Questo viola direttamente la **CLAUDE.md regola 22** ("Email normalisation must be uniform across ALL auth flows. Centralise normalisation in a single `normalizeEmail()` helper in `validation.ts` and apply it as the first line of every auth action before validation"). Una futura evoluzione di `normalizeEmail()` (es. aggiungere normalizzazione Unicode NFKC, gestione `+` aliases, IDN normalization) introdurrà silenziosamente una divergenza tra account creati prima e dopo la modifica.
- **Impatto**: silent inconsistency hazard. Oggi i due path producono lo stesso risultato per ASCII puro, ma divergono già su edge case (es. caratteri Unicode da combinare, whitespace non-ASCII). Account creati con un percorso non saranno trovati dall'altro dopo un futuro change. Il fix è gratuito (1 import + 1 sostituzione di riga) e si allinea alla regola già documentata.
- **Fix proposto**: in `src/server/auth-actions.ts` sostituire la riga 175:
  ```diff
  -  const email = rawEmail?.trim().toLowerCase() ?? "";
  +  const email = normalizeEmail(rawEmail);
  ```
  Verificare che `normalizeEmail` sia già importato (lo è — usato negli altri 3 path). Cercare con `grep -rn "trim().toLowerCase()" src/server` per scovare eventuali altri usi inline ancora vivi.
- **Test da aggiungere**: in `tests/unit/auth-actions-signup.test.ts` (esistente): test parametrizzato che `signUp` con email `"  User@EXAMPLE.COM  "` accetta il signin successivo con `"user@example.com"`. Aggiungere snapshot test che `signUp`, `signIn`, `magicLink`, `resetPassword` producano la stessa stringa normalizzata su 5 input edge case (uppercase, leading/trailing spaces, mixed unicode, IDN-like).
- **Trovato in passata**: 3

### [P2] `searchReceipts` lancia eccezione su ownership failure invece di ritornare error envelope
- **Categoria**: architettura
- **File**: `src/server/storico-actions.ts:43-46`
- **Problema**: dopo `checkBusinessOwnership(user.id, businessId)`, se l'ownership fallisce la action esegue `throw new Error("Non autorizzato.")`. Tutte le altre actions del repo (`emitReceipt`, `voidReceipt`, `saveAdeCredentials`, `updateProfile`, `getCatalogItems`, ecc.) seguono il pattern "ritorna `ownershipError`" che è un oggetto `{ error: string }`. Il throw qui rompe il contratto unico. I caller (RSC `dashboard/storico/page.tsx`) si trovano a dover gestire un'eccezione che non si aspettano: la pagina mostra il fallback Next `error.tsx` invece di un messaggio inline gestito.
- **Impatto**: UX inconsistente — un tentativo di IDOR (cambio `businessId` dalla URL/query) mostra una error boundary invece di un messaggio garbato. Il logger non riceve il context strutturato (`{ userId, businessId }`) perché l'eccezione è generica. Audit log debole. Inoltre, il pattern `throw + catch` su React Server Components è gestito diversamente dal client RSC fallback (Next streaming), e il throw bypassa la possibilità di tornare uno stato vuoto e segnalare via UI.
- **Fix proposto**:
  ```diff
  -    if (ownershipError) {
  -      throw new Error("Non autorizzato.");
  -    }
  +    if (ownershipError) {
  +      logger.warn(
  +        { userId: user.id, businessId },
  +        "searchReceipts: ownership check failed",
  +      );
  +      return { error: ownershipError.error, items: [], total: 0 };
  +    }
  ```
  Aggiornare il `SearchReceiptsResult` type se necessario per includere il caso `error`. Aggiornare `dashboard/storico/page.tsx` per gestire `result.error` mostrando un messaggio inline.
- **Test da aggiungere**: in `tests/unit/storico-actions.test.ts`: test che chiama `searchReceipts` con `businessId` di un altro utente e assert che ritorni `{ error: ..., items: [], total: 0 }` invece di lanciare. Test che `logger.warn` venga chiamato con `{ userId, businessId }`.
- **Trovato in passata**: 3

### [P3] `saveAdeCredentials`: SELECT-then-INSERT/UPDATE non atomico (preferire `onConflictDoUpdate`)
- **Categoria**: architettura / edge case
- **File**: `src/server/onboarding-actions.ts:210-235`
- **Problema**: il codice esegue `SELECT existing → if/else INSERT/UPDATE` invece di `INSERT … ON CONFLICT DO UPDATE` atomico. CLAUDE.md "Pattern `INSERT ... ON CONFLICT DO NOTHING`" raccomanda esplicitamente questo idiom per evitare race condition fra "SELECT then INSERT" su unique constraint. Due richieste concorrenti dello stesso utente (es. doppio submit del form Onboarding step credenziali) possono entrambe vedere `existing = null`, entrambe tentare INSERT, e una fallisce con `23505 unique_violation` → 500 al client invece del comportamento atteso (upsert idempotente).
- **Impatto**: oggi il rischio è basso perché la UI fa un singolo submit, ma un crash di rete con auto-retry o un doppio click porta a errore 500 visibile. Inoltre, due update concorrenti generano "lost update" (la seconda UPDATE sovrascrive con cifratura calcolata su un'istanza precedente di password). Per credenziali AdE — irreversibili, sensibili — la robustezza è importante.
- **Fix proposto**: sostituire le righe 210-235 con un singolo upsert:
  ```ts
  await db
    .insert(adeCredentials)
    .values({
      businessId,
      encryptedCodiceFiscale,
      encryptedPassword,
      encryptedPin,
      keyVersion,
    })
    .onConflictDoUpdate({
      target: adeCredentials.businessId, // assume vincolo UNIQUE su businessId
      set: {
        encryptedCodiceFiscale,
        encryptedPassword,
        encryptedPin,
        keyVersion,
        verifiedAt: null, // reset verifica su credential change
      },
    });
  ```
  Verificare in `src/db/schema/ade-credentials.ts` (o equivalente) che `businessId` abbia il vincolo UNIQUE — se manca, aggiungerlo prima del fix in una migrazione handwritten dedicata (CLAUDE.md regola 14).
- **Test da aggiungere**: integration test che chiama `saveAdeCredentials` due volte concorrentemente (`Promise.all`) per lo stesso `businessId` con valori diversi e verifica che (a) entrambe ritornino `{ businessId }` (no 500), (b) il record finale contenga uno dei due insiemi di valori (vince l'ultimo) — non corrompimento.
- **Trovato in passata**: 3

### [P3] `RateLimiter` Map non ha cap massimo tra le finestre di cleanup
- **Categoria**: architettura
- **File**: `src/lib/rate-limit.ts:25,34-35,88` (`windows = new Map()`, cleanup ogni `cleanupIntervalMs ?? 60_000`)
- **Problema**: `windows: Map<string, WindowEntry>` cresce ad ogni nuova chiave (`emit:<userId>`, `signIn:<ip>`, ecc.) e viene potata solo dal `cleanup()` periodico ogni 60 secondi. In una finestra di 60s di traffico distribuito da molti IP unici (es. burst da uno scanner di rete che colpisce route auth pubbliche, anche se rate-limited), il Map può contenere decine di migliaia di entry simultanee. Niente cap hardcoded → in scenario worst case un attaccante può forzare la process Node a consumare ~100MB di RAM nella struct rate-limiter (tipica VPS hobby ha 1-2GB), prima che il prossimo `cleanup()` riconosci scadenze.
- **Impatto**: rischio DoS via memory pressure su VPS limitata. Lo scenario richiede un attaccante con accesso a molti IP distinti (botnet, residential proxy), quindi la probabilità è bassa per una piattaforma SaaS hobby. Il rate limit per-IP funziona correttamente per l'attacco "tante richieste da 1 IP". L'edge case è solo per il pattern "1 richiesta da N IP".
- **Fix proposto**: aggiungere cap configurabile + LRU eviction. Snippet:
  ```ts
  interface RateLimiterOptions {
    maxRequests: number;
    windowMs: number;
    cleanupIntervalMs?: number;
    maxKeys?: number; // nuovo: hard cap
  }
  // dentro check():
  if (this.windows.size >= (this.maxKeys ?? 50_000)) {
    // Evict the oldest expired-or-about-to-expire entry
    const [oldestKey] = this.windows.keys();
    this.windows.delete(oldestKey);
  }
  ```
  Default conservativo: 50k chiavi (~5MB di overhead). Esporre `maxKeys` per casi specifici (es. webhook handler usa 10k).
- **Test da aggiungere**: in `tests/unit/rate-limit.test.ts`: test che inserisce `maxKeys + 100` chiavi distinte e verifica che `size` resti `<= maxKeys`. Test che la chiave più vecchia viene evicted (FIFO) prima di una recente.
- **Trovato in passata**: 3

### [P2] Pattern `(formData.get("x") as string)?.trim()` duplicato 35× nelle server actions
- **Categoria**: bad practice / type safety
- **File**: `src/server/onboarding-actions.ts:63-72,176`, `src/server/profile-actions.ts:40-41,75-89,120-122`, `src/server/auth-actions.ts:173-180,332-336,371`, e altri (35 occorrenze totali in `src/server/*.ts` confermate via `grep -rn "formData.get("`)
- **Problema**: il pattern `(formData.get("fieldName") as string)?.trim()` (con varianti `|| null`, `|| ""`) è ripetuto in 35 punti senza un helper centralizzato. Il cast `as string` è type-unsafe: `FormData.get()` ritorna `FormDataEntryValue | null` (cioè `string | File | null`), il cast nasconde un cast non controllato verso `string` che fallirebbe silenziosamente se il client mandasse un file binario. Non c'è un singolo punto in cui modificare la logica di sanitizzazione (oggi solo `.trim()`; domani potrebbe servire normalizzazione Unicode NFKC, strip di control char, o trim Unicode whitespace).
- **Impatto**: drift hazard alto. Se la policy di sanitizzazione cambia, ci sono 35 punti da aggiornare con rischio elevato di dimenticarne uno. Type safety bypassed dal cast `as string`. Codice rumoroso e poco leggibile (`(formData.get("zipCode") as string)?.trim()` vs `getFormString(fd, "zipCode")`).
- **Fix proposto**: nuovo file `src/lib/form-utils.ts` con due helper:
  ```ts
  export function getFormString(fd: FormData, key: string): string {
    const raw = fd.get(key);
    return typeof raw === "string" ? raw.trim() : "";
  }
  export function getFormStringOrNull(fd: FormData, key: string): string | null {
    const v = getFormString(fd, key);
    return v || null;
  }
  ```
  Refactor incrementale: sostituire prima nei file più grandi (`onboarding-actions.ts`, `auth-actions.ts`, `profile-actions.ts`). Aggiungere ESLint rule custom o regex-based `no-restricted-syntax` per bloccare nuove occorrenze del cast diretto.
- **Test da aggiungere**: in `tests/unit/form-utils.test.ts`: test che `getFormString` ritorna `""` per `null`, per `File`, per stringa vuota; ritorna trimmed per stringa con whitespace; rispetta Unicode whitespace se la policy lo richiede. Test che `getFormStringOrNull` ritorna `null` per stringa whitespace-only.
- **Trovato in passata**: 4

### [P3] Stringa "Troppi tentativi. Riprova tra qualche minuto." hard-coded in 5 punti
- **Categoria**: bad practice / DRY
- **File**: `src/server/auth-actions.ts:44`, `src/server/onboarding-actions.ts:441`, `src/server/profile-actions.ts:55,102,144` (5 occorrenze identiche confermate)
- **Problema**: il messaggio di errore rate-limit è copiato letteralmente in 5 punti. Viola DRY ed è un copy product/UX che dovrebbe vivere in un dizionario centralizzato. Future modifiche di copy (es. "Hai raggiunto il limite, riprova tra 15 minuti") richiedono touch su 5 file con rischio di drift (uno scappa). Inoltre, la futura introduzione di i18n richiederebbe estrarre tutte queste stringhe — fare il consolidamento ora abbassa il costo del lavoro futuro.
- **Impatto**: maintainability ridotta, rischio di inconsistenza UX. Costo i18n futuro più alto.
- **Fix proposto**: file `src/lib/error-messages.ts` con costanti centralizzate:
  ```ts
  export const ERROR_MESSAGES = {
    RATE_LIMIT_EXCEEDED: "Troppi tentativi. Riprova tra qualche minuto.",
    PASSWORD_NOT_STRONG: "Password non sicura. Usa almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale.",
    PASSWORDS_MISMATCH: "Le password non coincidono.",
    UNAUTHORIZED: "Non autorizzato.",
  } as const;
  ```
  Sostituire i 5 punti con `ERROR_MESSAGES.RATE_LIMIT_EXCEEDED`. Estendere progressivamente ad altri messaggi ricorrenti.
- **Test da aggiungere**: in `tests/unit/error-messages.test.ts`: smoke test che le costanti esistono e non sono empty. Optional: lint rule `no-restricted-syntax` che blocca string letterali "Troppi tentativi" fuori da `error-messages.ts`.
- **Trovato in passata**: 4

### [P3] Magic number `15 * 60 * 1000` ripetuto in 3 RateLimiter senza costante condivisa
- **Categoria**: bad practice / magic numbers
- **File**: `src/server/auth-actions.ts:26`, `src/server/onboarding-actions.ts:47`, `src/server/profile-actions.ts:32` (3 occorrenze confermate)
- **Problema**: la finestra di 15 minuti per i rate limiter di auth e onboarding è inline come `15 * 60 * 1000` in 3 file. Magic number che ripete la stessa intenzione senza nome esplicito. Se la security policy cambia (es. "30 minuti per change-password, 5 minuti per signin") non c'è un punto centrale di tuning; ogni file va modificato separatamente.
- **Impatto**: configurabilità ridotta. Audit di "quali sono le finestre rate limit?" richiede grep su tutta la codebase. Se in futuro si vuole differenziare per piano (trial più aggressivo) il refactor è capillare.
- **Fix proposto**: in `src/lib/rate-limit.ts` (o nuovo `src/lib/rate-limit-config.ts`):
  ```ts
  export const RATE_LIMIT_WINDOWS = {
    AUTH_15_MIN: 15 * 60 * 1000,
    HOURLY: 60 * 60 * 1000,
  } as const;
  ```
  Sostituire le 3 occorrenze con `RATE_LIMIT_WINDOWS.AUTH_15_MIN`. Estendere ad altri usi inline (`60 * 60 * 1000` per gli emit/void/checkout limiter).
- **Test da aggiungere**: nessun test runtime nuovo necessario (è un refactor). Eventualmente uno snapshot test che verifica i valori delle costanti.
- **Trovato in passata**: 4

### [P3] Messaggio "Password non sicura..." duplicato e con tono divergente tra `auth-actions` e `profile-actions`
- **Categoria**: bad practice / inconsistent UX
- **File**: `src/server/auth-actions.ts:114` ("Password non sicura. Usa almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale.") vs `src/server/profile-actions.ts:128` ("La nuova password non è sicura. Usa almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale.")
- **Problema**: lo stesso vincolo (`isStrongPassword()` da `src/lib/validation.ts`) genera due messaggi di errore con preambolo divergente ("Password non sicura" vs "La nuova password non è sicura"). L'utente percepisce due UX diverse per la stessa regola applicata in due flussi (signup vs change-password). Inoltre, i requisiti ("8 caratteri, maiuscola, minuscola, numero, speciale") sono hardcoded nel messaggio — se mai si cambia `isStrongPassword()` (es. a 12 caratteri) il messaggio diventa silenziosamente sbagliato in entrambi i posti.
- **Impatto**: drift tra implementazione e copy. UX inconsistente. Manutenzione fragile (cambio della regola = cambio in 2+ posti separati).
- **Fix proposto**: aggiungere helper in `src/lib/validation.ts` co-locato con `isStrongPassword()`:
  ```ts
  export const PASSWORD_REQUIREMENTS_MESSAGE =
    "Almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale.";
  export function validatePassword(pwd: string): string | null {
    return isStrongPassword(pwd) ? null : `Password non sicura. ${PASSWORD_REQUIREMENTS_MESSAGE}`;
  }
  ```
  Usare in entrambi i caller: `const err = validatePassword(newPassword); if (err) return { error: err };`. Oppure includere `PASSWORD_REQUIREMENTS_MESSAGE` in `ERROR_MESSAGES` (vedi finding precedente).
- **Test da aggiungere**: in `tests/unit/validation.test.ts`: test che `validatePassword` ritorna `null` per password forti e il messaggio per deboli. Snapshot del messaggio per catturare drift.
- **Trovato in passata**: 4

### [P3] Regex `/^\d{5}$/` per validazione CAP duplicato inline in 2 server actions
- **Categoria**: bad practice / DRY
- **File**: `src/server/onboarding-actions.ts:101`, `src/server/profile-actions.ts:91` (2 occorrenze identiche)
- **Problema**: la validazione CAP italiano è inline come `/^\d{5}$/.test(zipCode)` in `saveBusiness()` e `updateBusiness()`. Niente helper, niente nome esplicito (richiede commento per spiegare che è CAP). Se la regola cambia (es. accettare codici speciali di uffici postali militari, o trim leading zero, o supportare CAP esteri per business cross-border), il refactor tocca 2 punti con rischio di drift.
- **Impatto**: validazione non centralizzata. Bassa scoverability — un terzo flusso che aggiunge un campo CAP potrebbe ricreare il pattern una terza volta invece di riusare un helper.
- **Fix proposto**: in `src/lib/validation.ts` (dove vivono già `isStrongPassword`, `isValidUuid`, `normalizeEmail`):
  ```ts
  const ITALIAN_ZIP_REGEX = /^\d{5}$/;
  export function isValidItalianZipCode(zipCode: string): boolean {
    return ITALIAN_ZIP_REGEX.test(zipCode);
  }
  ```
  Sostituire le 2 occorrenze inline con `!isValidItalianZipCode(zipCode)`.
- **Test da aggiungere**: in `tests/unit/validation.test.ts`: test parametrizzato — `"00100"` (Roma) → true, `"20121"` (Milano) → true, `"1234"` → false, `"123456"` → false, `"1234a"` → false, `""` → false.
- **Trovato in passata**: 4

### [P3] `Resend` client istanziato ad ogni `sendEmail()` invece di singleton a livello di modulo
- **Categoria**: bad practice / consistency
- **File**: `src/lib/email.ts:19` (`const resend = new Resend(process.env.RESEND_API_KEY);` dentro la funzione `sendEmail`)
- **Problema**: ogni invocazione di `sendEmail()` istanzia un nuovo `Resend(...)`. Il pattern adottato altrove nel repo è singleton a module-scope (vedi `src/lib/stripe.ts` che esporta `stripe = new Stripe(...)` una volta sola). Il client Resend è stateless lato app, quindi non c'è motivo di re-istanziarlo per chiamata: spreca allocazioni e potenziale setup di pool HTTP interni dell'SDK. La leggibilità soffre — un lettore vede `new Resend()` dentro una hot function e si chiede se c'è ragione (non c'è).
- **Impatto**: micro-overhead per email (registrazione, password reset, account deletion, welcome). Inconsistenza interna con il pattern Stripe — fonte di confusione per nuovi contributor. Non critico in termini di performance, ma sintomo di code drift.
- **Fix proposto**: in `src/lib/email.ts` spostare a module-scope, dopo i `validate*` env helper:
  ```ts
  const resend = new Resend(process.env.RESEND_API_KEY);

  export async function sendEmail(opts: SendEmailOptions): Promise<void> {
    // … validation …
    const { error } = await resend.emails.send({ … });
    // …
  }
  ```
  Verificare che la lazy-init non sia richiesta da test (alcuni test mockano `process.env.RESEND_API_KEY` prima di importare il modulo — controllare `src/lib/email.test.ts` e adattare se rompe). Se il test setup richiede un import dinamico, mantenere il pattern ma estrarre la lazy-init in un `getResendClient()` memoizzato.
- **Test da aggiungere**: in `src/lib/email.test.ts`: spy sul constructor `Resend` (via `vi.mock("resend")`) e verificare che venga chiamato esattamente una volta indipendentemente dal numero di `sendEmail()` invocati nello stesso processo.
- **Trovato in passata**: 4

### [P3] `UUID_REGEX` reinventato inline in `fetch-public-receipt.ts` invece di usare `isValidUuid()` esistente
- **Categoria**: bad practice / DRY
- **File**: `src/lib/receipts/fetch-public-receipt.ts:12-13,33` vs `src/lib/uuid.ts:1-5`
- **Problema**: `fetch-public-receipt.ts` definisce `const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` e lo usa con `UUID_REGEX.test(documentId)`. Lo stesso identico regex è già esportato come helper `isValidUuid()` in `src/lib/uuid.ts` ed è usato consistentemente in 3+ route (`src/app/api/v1/receipts/[id]/route.ts:27`, `src/app/api/v1/receipts/[id]/void/route.ts:57`, `src/app/api/documents/[documentId]/pdf/route.ts:29`). Il duplicato in `fetch-public-receipt.ts` è una sostituzione inutile dell'helper, contraria alla regola 18 di CLAUDE.md ("UUID validation belongs at the route handler boundary, not inside the service").
- **Impatto**: duplicazione del regex. Se la regex evolve (es. accettare UUID v6/v7) c'è un punto da non dimenticare. Bassa scoverability — un terzo helper potrebbe nascere senza notare l'esistente.
- **Fix proposto**: in `src/lib/receipts/fetch-public-receipt.ts`:
  ```diff
  -const UUID_REGEX =
  -  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  +import { isValidUuid } from "@/lib/uuid";
   …
  -  if (!UUID_REGEX.test(documentId)) return null;
  +  if (!isValidUuid(documentId)) return null;
  ```
- **Test da aggiungere**: aggiornare i test esistenti di `fetch-public-receipt` (se presenti) per coprire input non-UUID; nessun test nuovo strettamente necessario perché l'helper è già coperto dai propri test.
- **Trovato in passata**: 4

### [P3] Messaggio rate-limit "Troppe richieste. Riprova tra qualche ora." in API v1 incoerente con il messaggio "Troppi tentativi" usato altrove
- **Categoria**: bad practice / inconsistent UX
- **File**: `src/lib/api-v1-helpers.ts:132` ("Troppe richieste. Riprova tra qualche ora.") vs i 5 punti in `src/server/*` con "Troppi tentativi. Riprova tra qualche minuto."
- **Problema**: il sistema espone all'utente due varianti di messaggio rate-limit con tono e tempistica diverse: "Troppi tentativi … minuto" sui flussi UI auth/profile, "Troppe richieste … ora" sull'API v1 pubblica. Le due varianti sono semanticamente corrette (window diverse, soggetto diverso: "tentativi" interattivi vs "richieste" automatiche), ma la stringa è hardcoded in entrambi i posti senza alcun riferimento a un dizionario centralizzato. Si combina con il finding precedente "Stringa Troppi tentativi hard-coded in 5 punti" → consolidare insieme.
- **Impatto**: futura i18n richiede 2 chiavi separate, drift del copy a manutenzione, esperienza UX non normata.
- **Fix proposto**: in `src/lib/error-messages.ts` (file da introdurre con il fix del finding precedente) aggiungere entrambe le varianti:
  ```ts
  export const ERROR_MESSAGES = {
    RATE_LIMIT_AUTH_MINUTES: "Troppi tentativi. Riprova tra qualche minuto.",
    RATE_LIMIT_API_HOURS: "Troppe richieste. Riprova tra qualche ora.",
    // …
  } as const;
  ```
  Sostituire `src/lib/api-v1-helpers.ts:132` con `ERROR_MESSAGES.RATE_LIMIT_API_HOURS`. Lasciare i caller di src/server sul `RATE_LIMIT_AUTH_MINUTES` (window 15 min). Documentare in commento la differenza di tone.
- **Test da aggiungere**: nessun test runtime nuovo — refactor che si appoggia ai test esistenti dei rate limiter. Optional: smoke test che `ERROR_MESSAGES.RATE_LIMIT_API_HOURS` venga ritornato dalla risposta 429 di `checkRateLimitApi()`.
- **Trovato in passata**: 4

### [P2] `PAYMENT_LABELS` divergente tra ricevuta web e PDF: stesso codice mostra testo diverso all'utente
- **Categoria**: bad practice / inconsistent UX (con potenziale confusion utente)
- **File**: `src/app/r/[documentId]/page.tsx:51-54` (`PC: "Contante"`, `PE: "Elettronico"`) vs `src/lib/pdf/generate-sale-receipt.ts:46-49` (`PC: "Pagamento contante"`, `PE: "Pagamento elettronico"`)
- **Problema**: `PAYMENT_LABELS` è duplicato in due file con **mapping divergente** per le stesse chiavi: lo scontrino visto sul web mostra "Contante", lo stesso scontrino esportato in PDF mostra "Pagamento contante". Stesso fenomeno per "Elettronico"/"Pagamento elettronico". Questo non è solo DRY: è un drift già accaduto, dimostrato dal fatto che le due copie hanno copy diversi. Probabilmente uno è stato modificato senza aggiornare l'altro. La regola CLAUDE.md 25 ("Quando si modifica una funzionalità, verificare se le pagine Help associate vanno aggiornate") si applica anche qui per lookup table di etichette UI.
- **Impatto**: utente confuso che condivide il link pubblico con un cliente e poi gli manda anche il PDF — vede due wording diversi e si domanda se sono lo stesso scontrino. Bug UX reale, non solo theoretical drift. Inoltre, futuri formati di esportazione (CSV pianificato, ZUGFeRD se mai) avranno una terza tabella e il drift si amplifica.
- **Fix proposto**: introdurre `src/lib/receipt-labels.ts` con la copia canonica e un solo allineamento di tono:
  ```ts
  export const PAYMENT_LABELS: Record<string, string> = {
    PC: "Contante",
    PE: "Elettronico",
  } as const;
  ```
  Decidere quale stringa è la "verità" (consigliato: la versione corta "Contante" ovunque, perché PDF da scontrino fiscale ha già il contesto). Importare da `r/[documentId]/page.tsx` e `lib/pdf/generate-sale-receipt.ts`. Estendere il refactor a `VAT_LABELS` (anch'esso triplicato: `src/types/cassa.ts:31` canonico + duplicati in `src/app/r/[documentId]/page.tsx:38` e `src/lib/pdf/generate-sale-receipt.ts:33` — tutti uguali oggi, ma con la stessa fragilità) e `formatPrice` (definito identicamente in `src/app/r/[documentId]/page.tsx:21` e `src/lib/pdf/generate-sale-receipt.ts:53`, distinto da `formatCurrency` di `src/lib/utils.ts` perché senza simbolo €). Centralizzare quindi in `src/lib/receipt-format.ts`:
  ```ts
  export const VAT_LABELS = (vedi types/cassa.ts) as const;
  export const PAYMENT_LABELS = { PC: "Contante", PE: "Elettronico" } as const;
  export function formatReceiptPrice(amount: number): string {
    return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }
  ```
- **Test da aggiungere**: in `tests/unit/receipt-labels.test.ts`: snapshot test delle costanti per catturare drift accidentale. Test di regressione che `r/[documentId]/page.tsx` e PDF generator producano la stessa stringa per i payment method (snapshot allineati). In CI, eventuale lint custom che `grep -rn "Pagamento contante\|Pagamento elettronico" src/` ritorni 0 risultati dopo il fix (impedire reintroduzione).
- **Trovato in passata**: 4

### [P3] Regex CAP `/^\d{5}$/` ripetuto anche nel client (`onboarding-form.tsx`) — terza occorrenza
- **Categoria**: bad practice / DRY (estensione del finding precedente)
- **File**: `src/app/onboarding/onboarding-form.tsx:44` (`zipCode: z.string().regex(/^\d{5}$/, "CAP non valido (5 cifre numeriche).")`)
- **Problema**: dopo aver già notato la duplicazione del regex CAP tra `onboarding-actions.ts` e `profile-actions.ts` (Pass 4 finding precedente), il regex compare una **terza volta** nel client onboarding form. Lo schema Zod del client validate inline con `.regex(/^\d{5}$/)`. Il messaggio di errore "CAP non valido (5 cifre numeriche)." è anche identico a quello server-side, ma manualmente sincronizzato — basta un typo a divergere. Combinato con il finding precedente: 3 punti da sincronizzare manualmente per regex + messaggio.
- **Impatto**: drift sicuro a tempo (due lati del fence client+server, due flussi server). Se un giorno si supportano CAP esteri o si aggiunge tolleranza per spaces, è un refactor a triple touch.
- **Fix proposto**: nel fix proposto per il finding CAP precedente, esportare anche un Zod schema riusabile da `src/lib/validation.ts`:
  ```ts
  export const ITALIAN_ZIP_REGEX = /^\d{5}$/;
  export const ITALIAN_ZIP_MESSAGE = "CAP non valido (5 cifre numeriche).";
  export function isValidItalianZipCode(zipCode: string): boolean {
    return ITALIAN_ZIP_REGEX.test(zipCode);
  }
  // Esportare anche una factory per Zod
  export const zItalianZipCode = () =>
    z.string().regex(ITALIAN_ZIP_REGEX, ITALIAN_ZIP_MESSAGE);
  ```
  Usare `zItalianZipCode()` nello schema client di `onboarding-form.tsx` e nel resto degli onboarding/profile schemas.
- **Test da aggiungere**: già coperti dal fix CAP server-side. Aggiungere un test che lo schema client rifiuti `"1234"` e `"abcde"` con il messaggio canonico.
- **Trovato in passata**: 4

### [P3] `FormData` costruita manualmente con 7 `.set()` ripetuti in `handleBusinessSubmit`
- **Categoria**: bad practice / type safety
- **File**: `src/app/onboarding/onboarding-form.tsx:131-142`, `155-161`
- **Problema**: entrambi i submit handler costruiscono `FormData` manualmente con `formData.set("firstName", data.firstName); formData.set("lastName", data.lastName); …` per 7-9 campi. È il counterpart sul lato client del finding "(formData.get as string)?.trim()" già notato server-side. Ogni nuovo campo richiede aggiornamento manuale della costruzione, e TypeScript non verifica che le chiavi `.set("xxx", …)` corrispondano ai nomi attesi dalla server action. Un rename di field nello schema Zod non spezza il build.
- **Impatto**: refactor fragile. Se aggiungo `phoneNumber` a step 1, devo: aggiornare schema Zod, aggiornare default values, aggiungere `<input>`, e ricordarmi di `formData.set("phoneNumber", data.phoneNumber)`. La dimenticanza porta a salvataggio silenzioso senza il nuovo campo (server riceve `null`), nessun errore visibile.
- **Fix proposto**: piccolo helper in `src/lib/form-utils.ts` (lo stesso file proposto per `getFormString`/`getFormStringOrNull`):
  ```ts
  export function objectToFormData<T extends Record<string, string | null | undefined>>(obj: T): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(obj)) {
      if (v != null) fd.set(k, String(v));
    }
    return fd;
  }
  ```
  Refactor:
  ```diff
  -  const formData = new FormData();
  -  formData.set("firstName", data.firstName);
  -  formData.set("lastName", data.lastName);
  -  // … 7 .set() ripetuti
  +  const formData = objectToFormData(data);
  ```
  Type-safe perché `data` è già tipato dal Zod schema. In più, è più chiaro al diff: l'aggiunta di un campo si vede in un solo posto (lo schema).
- **Test da aggiungere**: in `tests/unit/form-utils.test.ts`: test che `objectToFormData({a: "1", b: null, c: "2"})` produce FormData con solo `a` e `c` (skip null). Test che chiavi numeriche/Date vengano stringificate correttamente.
- **Trovato in passata**: 4

### [P2] `formatCurrency` reimplementato in storico components con signature divergente da `@/lib/utils`
- **Categoria**: DRY / inconsistenza API
- **File**: `src/components/storico/storico-client.tsx:46-51`, `src/components/storico/void-receipt-dialog.tsx:35-40`
- **Problema**: `@/lib/utils.ts:9` esporta `formatCurrency(amount: number)`, usato da `cassa-client`, `cart-line-item`, `receipt-summary`, `catalogo-client`. I due file dello storico definiscono localmente una loro versione `formatCurrency(amount: string)` che fa internamente `Number.parseFloat(amount)`. Stessa funzione, due signature diverse, due implementazioni. La duplicazione è anche una sorgente di code smell secondario: in `void-receipt-dialog.tsx:188-193` si vede il triplo cast `formatCurrency(String(Number.parseFloat(x) * Number.parseFloat(y)))` che esiste solo perché la versione locale richiede una `string` come input.
- **Impatto**: violazione DRY, manutenzione split (un cambiamento di formattazione monetaria — es. spazio non-breaking, simbolo prima/dopo per cambio locale futuro — va replicato in 3 punti). Inconsistenza visiva latente: oggi le tre versioni rendono identicamente perché usano lo stesso `Intl.NumberFormat`, ma divergeranno alla prima modifica dimenticata.
- **Fix proposto**: estendere il `formatCurrency` di `@/lib/utils.ts` per accettare anche `string`:
  ```ts
  export function formatCurrency(amount: number | string): string {
    const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
  }
  ```
  Eliminare le due definizioni locali in `storico-client.tsx` e `void-receipt-dialog.tsx`, sostituendole con `import { formatCurrency } from "@/lib/utils"`. Semplificare anche `void-receipt-dialog.tsx:188-193` rimuovendo il `String(...)` esterno e passando direttamente il `number` calcolato.
- **Test da aggiungere**: in `tests/unit/lib/utils.test.ts` (creare se non esiste): test che `formatCurrency("12.50")` e `formatCurrency(12.5)` ritornano lo stesso output `"12,50 €"`. Test edge case `formatCurrency("0")` e `formatCurrency(NaN)` (probabilmente "NaN €", documentare il comportamento).
- **Trovato in passata**: 4

### [P2] `formatDate` duplicato in 2 storico components con `year` divergente — UI inconsistente
- **Categoria**: DRY / inconsistenza UX
- **File**: `src/components/storico/storico-client.tsx:31-37`, `src/components/storico/void-receipt-dialog.tsx:27-33`
- **Problema**: due funzioni `formatDate` con la stessa firma e stesse opzioni `day: "2-digit", month: "2-digit"`, ma diversa opzione `year`: `storico-client` usa `"2-digit"` (es. `"20/05/26"`), mentre `void-receipt-dialog` usa `"numeric"` (es. `"20/05/2026"`). Lo stesso scontrino mostra una data con 2 cifre per l'anno nella tabella e con 4 cifre nel dialog di annullo. Inoltre non esiste un helper `formatDate` condiviso in `@/lib/utils`, quindi la duplicazione si propaga a ogni nuovo componente che mostra date.
- **Impatto**: incoerenza visiva diretta nel flusso utente (lista → click su una riga → dialog dettaglio → la data cambia formato). Maintenance debt che cresce ad ogni nuovo componente che formatta date. Niente type safety sull'opzione di anno.
- **Fix proposto**: aggiungere a `@/lib/utils.ts`:
  ```ts
  export function formatDate(date: Date | string, year: "2-digit" | "numeric" = "numeric"): string {
    return new Date(date).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year,
    });
  }
  ```
  Decidere quale formato è canonico per l'app (`"numeric"` è più leggibile e già usato nel dialog) e applicarlo ovunque. Rimuovere le due definizioni locali e fare `import { formatDate } from "@/lib/utils"`.
- **Test da aggiungere**: in `tests/unit/lib/utils.test.ts`: `formatDate(new Date("2026-05-20"))` ritorna `"20/05/2026"`; con override `"2-digit"` ritorna `"20/05/26"`. Test che accetti sia `Date` che `string` ISO.
- **Trovato in passata**: 4

### [P3] React `key` costruito da concatenazione di campi contenuto in `void-receipt-dialog`
- **Categoria**: bad practice React
- **File**: `src/components/storico/void-receipt-dialog.tsx:176`
- **Problema**: `key={`${line.description}-${line.vatCode}-${line.grossUnitPrice}-${line.quantity}`}` usa il contenuto della riga come chiave. Due righe con stessa descrizione, stesso codice IVA, stesso prezzo e stessa quantità (caso reale: "Caffè · 22 · 1,50 · 1") collidono → React emette warning `Encountered two children with the same key`, e in caso di update il diff può diventare inconsistente. Il delimitatore `-` può anche introdurre ambiguità se uno dei campi lo contiene (`"Coffee-Maker"`).
- **Impatto**: bug latente: oggi le righe del dialog non vengono né riordinate né aggiunte/rimosse durante il ciclo di vita del componente (i dati arrivano statici da una RSC), quindi il warning compare in console ma non causa visual glitch. Diventerà un bug reale se in futuro si introduce edit inline delle righe o riordino.
- **Fix proposto**: aggiungere un `id` stabile alle righe già nel mapping server-side (`storico-actions.ts` quando carica le righe), e usarlo come key. In alternativa più rapida, usare `index` esplicitamente — accettabile in questo caso perché le righe non si riordinano:
  ```tsx
  {receipt.lines.map((line, index) => (
    <div key={`${receipt.id}-line-${index}`} ...>
  ))}
  ```
  Preferito: aggiungere `id` o `lineNumber` al tipo `ReceiptListItem.lines[number]`.
- **Test da aggiungere**: rendering test (`@testing-library/react`) che monta `VoidReceiptDialog` con un `receipt.lines` contenente due righe identiche e verifica che non ci sia warning React in `console.error`.
- **Trovato in passata**: 4

### [P3] `package.json` senza campo `engines.node` — versione Node.js non vincolata
- **Categoria**: infra / reproducibility
- **File**: `package.json` (campo `engines` assente)
- **Problema**: il `package.json` specifica `"packageManager": "npm@11.12.1"` ma non ha il campo `"engines"` che vincoli la versione di Node.js. Il progetto richiede implicitamente Node.js ≥ 22 (Next.js 16, `import type` runtime, `tsx`, `postgres@3.4` con `dns/promises`), e il `Dockerfile` di runtime usa `node:22-alpine`. Senza `engines`, npm non emette warning quando viene fatto `npm install` su una Node mismatch in dev locale. Il primo segnale di errore arriva solo in fase di build/runtime.
- **Impatto**: developer experience: contributor con Node 18 o 20 incappano in errori cryptici (`SyntaxError`, `module not found` su `node:` prefisso) invece di un warning chiaro a `npm install`. Mismatch silenzioso tra dev locale e CI/Docker.
- **Fix proposto**: in `package.json` aggiungere:
  ```json
  {
    "packageManager": "npm@11.12.1",
    "engines": {
      "node": ">=22.0.0"
    },
  }
  ```
  Allineare anche con `node:22-alpine` del Dockerfile e `actions/setup-node` (verificare la versione su `.github/workflows/*`). Considerare `engineStrict: true` in `.npmrc` se si vuole bloccare hard l'install.
- **Test da aggiungere**: in CI workflow, un job a parte che fallisce se la versione Node attiva non rispetta `engines` (`node -v` confrontato con `package.json`). Oppure delegare a `npm install --engine-strict`.
- **Trovato in passata**: 4

### [P3] UUID fixture hard-coded duplicato in 9 test file — assenza di `tests/_helpers/fixtures.ts`
- **Categoria**: DRY / test maintenance
- **File**: 9 test in `tests/unit/` (tra cui `api-v1-receipt-*.test.ts`, `server-receipt-actions.test.ts`, `server-void-actions.test.ts`, `receipt-service-password-expired.test.ts`, `api-documents-pdf.test.ts`, `lib-uuid.test.ts`)
- **Problema**: il literal UUID `"550e8400-e29b-41d4-a716-446655440000"` ricorre 9 volte come ID fittizio (business/profile/document a seconda del test); `"660e8400-e29b-41d4-a716-446655440001"` ricorre 3 volte. Non c'è un modulo `tests/_helpers/fixtures.ts` o equivalente che centralizzi le UUID-fixture. Ogni nuovo test ricopia il literal e deve indovinare quale UUID usare se vuole essere coerente con altri test che condividono lo stesso scenario.
- **Impatto**: friction nello scrivere nuovi test; rischio che un refactor cambi il significato di una UUID in un file e non in un altro creando test silenziosamente non rappresentativi. Niente single source of truth per "la UUID del business test", "la UUID del documento test", ecc.
- **Fix proposto**: creare `tests/_helpers/fixtures.ts`:
  ```ts
  // UUID v4 fissi per fixture cross-test (mantenere stabili!)
  export const TEST_BUSINESS_ID = "550e8400-e29b-41d4-a716-446655440000";
  export const TEST_DOCUMENT_ID = "660e8400-e29b-41d4-a716-446655440001";
  export const TEST_PROFILE_ID  = "770e8400-e29b-41d4-a716-446655440002";
  export const TEST_USER_AUTH_ID = "880e8400-e29b-41d4-a716-446655440003";
  // …altre fixture comuni: TEST_API_KEY_ID, TEST_LINE_ID, etc.
  ```
  Migrare progressivamente i 9 file: `import { TEST_BUSINESS_ID } from "../_helpers/fixtures"`. Aggiungere alla CLAUDE.md una nota sotto "Linee guida test" sull'uso di `tests/_helpers/`.
- **Test da aggiungere**: ESLint rule custom (o lint-staged check) che vieta UUID hard-coded nei file `tests/unit/*.test.ts` se appaiono già in `_helpers/fixtures.ts`. In alternativa, smoke test della migrazione: `grep -c "550e8400-e29b-41d4-a716-446655440000" tests/unit/*.test.ts | awk -F: '$2>0' | wc -l` deve essere 0 dopo il refactor.
- **Trovato in passata**: 4

