# Code Review — ScontrinoZero
<!-- STATE: in_progress -->
<!-- LAST_PASS: 1 -->
<!-- LAST_AREA_COMPLETED: config-infra -->
<!-- NEXT_AREA_TO_SCAN: src/app -->
<!-- AREAS_REMAINING: src/app, src/server, src/lib, src/components, supabase, scripts, tests, config-infra (Pass 2) -->

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

