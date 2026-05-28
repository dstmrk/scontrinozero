# Code Review — `v1.3.2` → HEAD

> Branch: `claude/code-review-prod-tag-sjLWt` · Range: `v1.3.2..HEAD`
> (commit `84302fa..8141e17`, ~50 commit, 78 file modificati)
> Data review: 2026-05-27

## Sommario

Code review approfondita di tutti i cambiamenti tra l'ultimo tag in produzione
(`v1.3.2`) e HEAD. Obiettivo: identificare problemi di sicurezza, performance,
funzionalità, architettura e bad practice introdotti dal nuovo codice.

**Scope** — esaminati tutti i file modificati ECCETTO le pagine di marketing
(`src/app/(marketing)/*`, `src/components/marketing/*`, `src/components/help/*`,
`src/components/json-ld.tsx`, `src/lib/guide/articles.ts`,
`src/lib/per/categories.ts`, `src/lib/strumenti/tools.ts`).

**Cross-reference con `PLAN.md`** — i finding già tracciati nel backlog non
sono duplicati. Sono richiamati solo quando il nuovo diff aggrava
direttamente il problema. Vedi sezione "Appendice" in fondo.

**Severity scale**

| Sev | Significato |
|---|---|
| Critical | Blocca la prossima release. Sicurezza, dati, downtime. |
| High | Fix prima del prossimo tag in produzione. |
| Medium | Fix entro 2 release. |
| Low | Quando si tocca il file per altro motivo. |
| Informational | Note, non azionabili da sole. |

**Convenzioni dei finding** — ogni finding ha `File:line`, **Descrizione**
(cosa, perché, scenario), **Fix** (cambiamenti concreti, helper riusabili,
test file da aggiornare), **Verifica** (comando + scenario manuale),
e dove rilevante un riferimento a `PLAN.md`.

---

## Critical

_Nessun finding._

---

## High

### H1. Dataset analytics ri-fetchato 4 volte per ogni cambio range

**Categoria**: Performance / Architecture
**File**: `src/server/analytics-actions.ts:265-291`,
`src/components/analytics/analytics-client.tsx:78-96`

**Descrizione.** `getCachedDataset` usa `cache()` di React, che deduplica
**solo entro il singolo render RSC** (lo dice il commento stesso a riga 271).
Quando il client cambia range (`handleRangeChange`), parte un `Promise.all`
di 4 Server Action separate: `getAnalyticsKpis`, `getRevenueTimeseries`,
`getPaymentBreakdown`, `getProductBreakdown`. Ognuna è una richiesta HTTP
isolata con il proprio scope `cache()` → niente deduplica cross-action.

Risultato concreto per ogni cambio range:

- **4× `authorizePro`** → 4× `getAuthenticatedUser` + 4× `checkBusinessOwnership` + 4× `getPlan` (12 query auth aggiuntive)
- **4× `fetchSaleDocsInRange`** con `includePublicRequest:true` (jsonb fetched 4 volte invece di 1)
- **4× `fetchLinesByDocIds` + 4× `groupLinesByDocId` + 4× `calcDocTotal`**
- **4 token rate-limit consumati** su un budget di 60/h → l'utente esaurisce dopo **15 cambi range/ora**

Il commento nel codice (riga 270-273) ammette il limite ("`cache()` e' no-op
fuori da un render RSC (es. unit test)") ma il design del client non lo
rispetta: invece di sfruttare la deduplica unica del render RSC, il
client-side range change la annulla.

Il render RSC iniziale (`src/app/dashboard/analytics/page.tsx:71-78`)
invece beneficia correttamente della deduplica perché tutte e 4 le call
sono dentro lo stesso render scope.

**Fix.**

1. Esporre una nuova Server Action aggregata in `src/server/analytics-actions.ts`:

   ```ts
   export async function getAnalyticsBundle(
     businessId: string,
     range: AnalyticsRange,
   ): Promise<
     | {
         kpis: AnalyticsKpis;
         timeseries: RevenuePoint[];
         breakdown: PaymentBreakdownEntry[];
         productBreakdown: ProductBreakdownEntry[];
       }
     | { error: string }
   > {
     const result = await getAnalyticsDataset(businessId, range);
     if (!result.ok) return { error: result.error };
     return {
       kpis: computeKpis(result.docs, result.totalsByDoc),
       timeseries: computeTimeseries(
         result.docs,
         result.totalsByDoc,
         result.from,
         result.to,
       ),
       breakdown: computeBreakdown(result.docs, result.totalsByDoc),
       productBreakdown: computeProductBreakdown(result.docs, result.linesByDoc),
     };
   }
   ```

2. In `src/components/analytics/analytics-client.tsx`, sostituire il `Promise.all`
   nel `handleRangeChange` (riga 78-96) con una singola chiamata:

   ```ts
   const result = await getAnalyticsBundle(businessId, nextRange);
   if (latestRangeRef.current !== nextRange) return;
   if ("error" in result) {
     setKpis(ZERO_KPIS);
     setTimeseries([]);
     setBreakdown([]);
     setProductBreakdown([]);
     setLoadFailed(true);
     return;
   }
   setKpis(result.kpis);
   setTimeseries(result.timeseries);
   setBreakdown(result.breakdown);
   setProductBreakdown(result.productBreakdown);
   setLoadFailed(false);
   ```

3. Aggiornare anche `src/app/dashboard/analytics/page.tsx` per usare
   `getAnalyticsBundle` (mantiene la deduplica via `cache()` nel render
   iniziale ma con un'unica chiamata esplicita, più leggibile).

4. Rimuovere — o marcare `@deprecated` — le 4 server action `getAnalyticsKpis`,
   `getRevenueTimeseries`, `getPaymentBreakdown`, `getProductBreakdown` se
   non sono usate altrove. Verificare con `grep -rn "getAnalyticsKpis\|getRevenueTimeseries\|getPaymentBreakdown\|getProductBreakdown" src/`.

5. Aggiornare i test in `src/server/analytics-actions.test.ts` e
   `src/components/analytics/analytics-client.test.tsx` per la nuova firma.

**Verifica.**
- `npm run test:coverage -- analytics`
- Aprire `/dashboard/analytics` con DevTools → Network, cambiare range.
  Confermare **1 sola richiesta** a `/_actions/...` invece di 4.
- Aggiungere un test che mocka `fetchSaleDocsInRange` con `vi.fn()` e
  verifica che `mockFetch.mock.calls.length === 1` dopo un cambio range.

---

### H2. `block-push-to-main.sh` bypassabile con `branch:main`, `:main` e force-push refspec

**Categoria**: Security / Bad Practice (defense bypass)
**File**: `.claude/hooks/block-push-to-main.sh:14`

**Descrizione.** La regex corrente

```
git[[:space:]]+push([[:space:]]+[^&|;]*)?[[:space:]](main|HEAD:main)(\b|$)
```

richiede uno **spazio** prima di `main` (per il match `(main|HEAD:main)`).
I refspec di Git che hanno `:` o `/` prima del nome destinazione la
aggirano completamente. Test confermato (Python re, equivalente a `grep -E`):

| Comando | Esito atteso | Esito attuale |
|---|---|---|
| `git push origin main` | BLOCK | **BLOCK** ✓ |
| `git push origin HEAD:main` | BLOCK | **BLOCK** ✓ |
| `git push origin develop:main` | BLOCK | **BYPASS** ✗ |
| `git push origin :main` (delete remote) | BLOCK | **BYPASS** ✗ |
| `git push -f origin develop:main` | BLOCK | **BYPASS** ✗ |
| `git push origin +main` (force-update) | BLOCK | **BYPASS** ✗ |

Il primo riscrive `main` con i commit di `develop`. Il secondo cancella la
branch remota. Il terzo è una force-push silenziosa. Il quarto è un'altra
sintassi di force. Tutti aggirano CLAUDE.md regola 1 ("mai commit/push
diretti su main") che il hook dovrebbe enforce.

Probabilità reale: bassa (nessuno scrive `develop:main` per errore), ma la
difesa è scritta come safety net contro mistake, quindi i bypass contano.

**Fix.**

1. Cambiare la regex per intercettare qualsiasi refspec con destination
   `main`. Una formulazione robusta:

   ```bash
   if printf '%s' "$normalized" | grep -qE 'git[[:space:]]+push.*([[:space:]:+]|^)(main|HEAD:main|refs/heads/main)([[:space:]]|$)'; then
   ```

   Note:
   - `([[:space:]:+]|^)` ammette spazio, `:`, `+`, o inizio stringa prima di `main`.
   - Aggiunto `refs/heads/main` (sintassi esplicita usata in CI/script).
   - `([[:space:]]|$)` boundary finale rimane.

2. Aggiungere un file di test bash `.claude/hooks/test-block-push-to-main.sh`:

   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   HOOK=".claude/hooks/block-push-to-main.sh"

   test_block() {
     local cmd="$1" expected="$2"
     local out
     out=$(printf '{"tool_input":{"command":"%s"}}' "$cmd" | bash "$HOOK" 2>&1 || true)
     local exitcode=$?
     if [ "$expected" = "block" ] && [ $exitcode -ne 2 ]; then
       echo "FAIL: expected BLOCK, got PASS for: $cmd"; exit 1
     fi
     if [ "$expected" = "pass" ] && [ $exitcode -eq 2 ]; then
       echo "FAIL: expected PASS, got BLOCK for: $cmd"; exit 1
     fi
   }

   # PASS cases
   test_block "git push origin feature" "pass"
   test_block "git push origin develop" "pass"
   test_block "git push origin HEAD:feature" "pass"
   test_block "git tag v1.3.3" "pass"

   # BLOCK cases
   test_block "git push origin main" "block"
   test_block "git push origin HEAD:main" "block"
   test_block "git push origin develop:main" "block"
   test_block "git push origin :main" "block"
   test_block "git push -f origin develop:main" "block"
   test_block "git push origin +main" "block"
   test_block "git push origin refs/heads/main" "block"

   echo "All bash hook tests passed."
   ```

   Renderlo eseguibile (`chmod +x`).

3. Eseguirlo manualmente come `./.claude/hooks/test-block-push-to-main.sh`
   e considerare di farlo invocare dal CI (workflow GitHub Actions su
   PR che toccano `.claude/hooks/`).

**Verifica.**
- Eseguire `./.claude/hooks/test-block-push-to-main.sh` → "All bash hook tests passed."
- Tentare manualmente in container Claude: `git push origin develop:main --dry-run` → confermare blocco.

---

## Medium

### M1. `recharts` importato staticamente nel nuovo widget product-breakdown

**Categoria**: Performance
**File**: `src/components/analytics/product-breakdown.tsx:3-11`,
`src/components/analytics/analytics-client.tsx:16-19`

**Descrizione.** Il nuovo componente `ProductBreakdown` importa `recharts`
top-level. Recharts pesa ~100KB gzipped. La libreria è già caricata dagli
altri due widget analytics (`payment-breakdown.tsx`, `revenue-sparkline.tsx`)
in modo statico — il `PLAN.md` ha già un entry P3 per "**`recharts` dynamic
import**". Il nuovo `product-breakdown.tsx` aggiunge un terzo punto di import
statico, **aggravando** il problema senza estendere il PLAN.md.

Il principio CLAUDE.md "Leggeri sulle risorse" vale anche lato client: ogni
KB nel bundle iniziale rallenta TTI/FCP sulle connessioni 3G/4G mobili
(target principale di un'app POS).

**Fix.**

1. In `src/components/analytics/analytics-client.tsx`, sostituire i tre
   import statici dei widget recharts con `dynamic`:

   ```ts
   import dynamic from "next/dynamic";

   const PaymentBreakdown = dynamic(
     () => import("./payment-breakdown").then((m) => ({ default: m.PaymentBreakdown })),
     { ssr: false, loading: () => <div className="h-[260px]" /> },
   );
   const RevenueSparkline = dynamic(
     () => import("./revenue-sparkline").then((m) => ({ default: m.RevenueSparkline })),
     { ssr: false, loading: () => <div className="h-[140px]" /> },
   );
   const ProductBreakdown = dynamic(
     () => import("./product-breakdown").then((m) => ({ default: m.ProductBreakdown })),
     { ssr: false, loading: () => <div className="h-[260px]" /> },
   );
   ```

   Le altezze del placeholder devono coincidere con `h-[260px]` /
   `h-[140px]` dei widget per evitare layout shift.

2. Aggiornare `src/components/analytics/analytics-client.test.tsx` per
   gestire il dynamic import: dove ora c'è `screen.getByText("Prodotti...")`
   o simili, usare `await screen.findByText(...)`.

3. Marcare l'entry `PLAN.md` P3 "`recharts` dynamic import" come risolta
   (estesa anche a `product-breakdown.tsx`) o aggiornarla per riflettere
   l'inclusione del nuovo widget.

**Verifica.**
- `npm run build` con `ANALYZE=true` (se configurato) o `npx @next/bundle-analyzer`:
  confermare un chunk `recharts-*.js` separato.
- DevTools → Coverage tab su `/dashboard/analytics`: verificare ~100KB in
  meno nel JS iniziale rispetto al baseline.
- `npm run test -- analytics-client`.

**PLAN.md cross-ref.** P3 "`recharts` dynamic import" — questa fix lo
chiude estendendolo al nuovo widget.

---

### M2. `finalizeSaleOnly` manca di `withStatementTimeout` (incoerenza con `finalizeVoidOnly`)

**Categoria**: Bug / Architecture
**File**: `src/lib/services/receipt-service.ts:375-418`,
confronto con `src/lib/services/void-service.ts:170-229`

**Descrizione.** `finalizeVoidOnly` (void-service:180-196) wrappa
correttamente la UPDATE con `retryOnStatementTimeout("void-finalize-only",
() => withStatementTimeout(3000, async (tx) => ...))`. La doppia protezione
è documentata: "Retry on statement timeout + SET LOCAL statement_timeout
(3s). submitVoid è già andato a buon fine, dobbiamo riuscire a finalizzare
prima di rinunciare (3 tentativi: 200ms → 500ms → 1s)".

`finalizeSaleOnly` (receipt-service:381-391) usa **solo**
`retryOnStatementTimeout("emit-finalize-only", () => db.update(...))`,
senza `withStatementTimeout`. Conseguenza: se la connessione DB è
congestionata, ogni tentativo della UPDATE può attendere indefinitamente
prima che il retry passi al prossimo. La submitSale è già successa su
AdE (lo scontrino è registrato fiscalmente) → ogni secondo perso lascia
il documento DB in stato `PENDING` mentre lato AdE è `ACCEPTED` —
mismatch che la stale recovery dovrà sistemare manualmente.

Lo stesso commento ("3 tentativi: 200ms → 500ms → 1s, submit AdE è già
successa, dobbiamo riuscire a finalizzare") vale identico per receipt e
void: l'asimmetria è una svista del refactor.

**Fix.**

In `src/lib/services/receipt-service.ts:381-391`, modificare la chiamata
così:

```ts
await retryOnStatementTimeout("emit-finalize-only", () =>
  withStatementTimeout(3000, async (tx) =>
    tx
      .update(commercialDocuments)
      .set({
        status: "ACCEPTED",
        adeTransactionId,
        adeProgressive,
      })
      .where(eq(commercialDocuments.id, documentId)),
  ),
);
```

Aggiungere l'import di `withStatementTimeout` (già presente nel file a
riga 21-22, OK).

**Verifica.**
- Aggiungere in `src/lib/services/receipt-service.test.ts` un test che
  mocka `db.update` con una `Promise` mai-resolved e verifica che dopo
  ~5s totali la funzione ritorna `DB_TIMEOUT` (3 tentativi × ~timeout).
  Il test esistente per `finalizeVoidOnly` in `void-service.test.ts` è
  un buon riferimento.
- `npm run test -- receipt-service`.

---

### M3. `logger.error` per AdE-down (5xx/network) apre Sentry per ogni downtime

**Categoria**: Bad Practice / Performance (telemetry noise)
**File**:
- `src/lib/services/receipt-service.ts:573-583` (catch in `submitSaleToAde`)
- `src/lib/services/void-service.ts:602-606` (catch in `voidReceiptForBusiness`)
- `src/server/onboarding-actions.ts:359` (catch in `verifyAdeCredentials`)
- `src/server/onboarding-actions.ts:586-590` (catch in `changeAdePassword`)

**Descrizione.** Il commit 8c654b5 ha correttamente downgradato
`esito:false` (rifiuto business AdE) da `error` a `warn` per evitare di
aprire issue Sentry su rejection AdE.

Però il `catch` esterno usa ancora `logger.error({ err, ... }, "... failed")`
anche per errori che il nuovo helper `getUserFacingAdeErrorMessage` classifica
esplicitamente come transient e non-blaming (AdE non risponde, AdE non
raggiungibile):

- `AdeNetworkError` — il client non riesce a connettersi all'AdE
- `AdePortalError` con `statusCode >= 500` — AdE risponde 5xx
- `AdeSpidTimeoutError` — utente non approva SPID

Tutti producono messaggi user-facing del tipo "Non dipende da te né da
ScontrinoZero. Riprova tra qualche minuto." Sono **non actionable** per
ScontrinoZero: nessun fix lato nostro li risolverà. Ma con `logger.error`
(level 50) il logger pubblica una `Sentry.captureException` per **ogni**
utente che tenta un'operazione durante il downtime AdE.

Effetto: durante una manutenzione AdE di 2 ore con 100 utenti che provano
a emettere, si generano ~100 issue Sentry tutte identiche, che mascherano
gli errori veri.

L'asimmetria con `esito:false` (warn) è incoerente: entrambi sono "AdE
down/giù", solo il transport è diverso (1 è 200+body, l'altro è 5xx).

**Fix.**

1. In `src/lib/ade/error-messages.ts`, esportare un helper di
   classificazione (vicino a `getUserFacingAdeErrorMessage`):

   ```ts
   import {
     AdeAuthError,
     AdeNetworkError,
     AdePasswordExpiredError,
     AdePortalError,
     AdeSpidTimeoutError,
   } from "./errors";

   /**
    * Ritorna true se l'errore è una condizione transient su cui ScontrinoZero
    * non può fare nulla (downtime AdE, rete, SPID timeout). Questi errori
    * vanno loggati a warn (non error) per non aprire issue Sentry spurie.
    */
   export function isTransientAdeError(err: unknown): boolean {
     if (err instanceof AdeNetworkError) return true;
     if (err instanceof AdeSpidTimeoutError) return true;
     if (err instanceof AdePortalError && err.statusCode >= 500) return true;
     return false;
   }
   ```

2. Applicare il pattern nei 4 catch sopra. Esempio per
   `receipt-service.ts:573-583`:

   ```ts
   } catch (err) {
     const transient = isTransientAdeError(err);
     const logFn = transient ? logger.warn : logger.error;
     logFn(
       {
         err,
         documentId,
         businessId: input.businessId,
         recovery: options.recovery,
         errorClass: transient ? "ade_transient" : "ade_failure",
       },
       transient
         ? "emitReceiptForBusiness AdE transient failure"
         : "emitReceiptForBusiness failed",
     );
     // ...resto del catch invariato
   }
   ```

   Stesso pattern per `void-service.ts:602-606` (cambiare il messaggio in
   `"voidReceiptForBusiness ..."`), `onboarding-actions.ts:359` e
   `onboarding-actions.ts:586-590`.

3. Aggiungere test in `src/lib/ade/error-messages.test.ts` per
   `isTransientAdeError` (tutti i casi true + un caso false con un
   `AdeAuthError`).

4. Aggiungere test in `src/lib/services/receipt-service.test.ts`
   (e `void-service.test.ts`, `onboarding-actions.test.ts`) che lancia
   `new AdePortalError({ statusCode: 503, ... })` e verifica
   `logger.warn` è chiamato, `logger.error` non lo è.

**Verifica.**
- `npm run test -- error-messages receipt-service void-service onboarding-actions`
- Manuale: in dev, mockare `RealAdeClient.submitSale` con
  `throw new AdePortalError({ statusCode: 503, ... })`, emettere uno
  scontrino, verificare che il log a stdout è level `warn` (40) e che
  `Sentry.captureException` non viene invocato (logger.ts hook a riga 136
  è `level >= 50`).

---

### M4. `APP_HOSTNAME` runtime override non valida hostname né protocollo

**Categoria**: Security / Bad Practice
**File**: `src/lib/marketing-to-app-href.ts:31-35`

**Descrizione.** Nel branch `runtimeHost`:

```ts
const runtimeHost = process.env.APP_HOSTNAME;
if (runtimeHost) {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${runtimeHost}`;
}
```

Tre problemi:

1. **Nessun controllo di schema embedded**: se `APP_HOSTNAME=https://evil.com`,
   il risultato è `https://https://evil.com/login` — URL malformato che il
   browser può interpretare in vari modi.
2. **Nessun controllo di path/slash**: se `APP_HOSTNAME=app.scontrinozero.it/redirect`,
   il risultato `https://app.scontrinozero.it/redirect/login` non è il dominio app.
3. **Nessuna verifica contro `allowedHostnames()`**: la stessa allowlist
   applicata al branch `NEXT_PUBLIC_APP_URL` (riga 47-49) non viene applicata
   qui. Se `APP_HOSTNAME=evil.com`, il link punta a `https://evil.com/login`
   senza alcun fallback al default.

La difesa è asimmetrica fra i due branch. Vector reale: bassa probabilità
(richiede compromessione delle env var del container, non è user-controllable),
ma per coerenza la stessa allowlist dovrebbe valere ovunque. Inoltre, una
typo nel file `.env` (es. `APP_HOSTNAME=https://app.scontrinozero.it`
invece del solo hostname) produce silenziosamente link rotti che non
appaiono nei test perché i test della funzione passano solo hostname puri.

**Fix.**

In `src/lib/marketing-to-app-href.ts:25-51`, sostituire `resolveBaseUrl`
con:

```ts
function resolveBaseUrl(): string {
  const runtimeHost = process.env.APP_HOSTNAME;
  if (runtimeHost) {
    // Validate: must be hostname-only (no scheme, no path, no slash).
    if (runtimeHost.includes("://") || runtimeHost.includes("/")) {
      return HARDCODED_DEFAULT;
    }
    if (!allowedHostnames().has(runtimeHost)) {
      return HARDCODED_DEFAULT;
    }
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    return `${protocol}://${runtimeHost}`;
  }

  // ... resto invariato
}
```

Aggiungere casi in `src/lib/marketing-to-app-href.test.ts`:

```ts
it("falls back to default when APP_HOSTNAME contains a scheme", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_HOSTNAME", "https://app.scontrinozero.it");
  const { appHref } = await import("./marketing-to-app-href");
  expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
});

it("falls back to default when APP_HOSTNAME contains a path", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_HOSTNAME", "app.scontrinozero.it/redirect");
  const { appHref } = await import("./marketing-to-app-href");
  expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
});

it("falls back to default when APP_HOSTNAME is outside allowlist", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_HOSTNAME", "evil.com");
  const { appHref } = await import("./marketing-to-app-href");
  expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
});
```

Nota: il test "honours APP_HOSTNAME runtime override" esistente
(riga 29-36) usa `APP_HOSTNAME="sandbox.scontrinozero.it"` con
`NEXT_PUBLIC_APP_URL="https://sandbox.scontrinozero.it"`, e nella
`allowedHostnames()` viene aggiunta via `NEXT_PUBLIC_APP_HOSTNAME` —
verificare che la nuova validazione non rompa quel caso. Probabilmente
serve estendere `allowedHostnames()` per riconoscere anche `APP_HOSTNAME`
come fonte (già fa parte di `fromEnv` a riga 14-16) — il caso passa
naturalmente.

**Verifica.**
- `npm run test -- marketing-to-app-href`
- Manuale: deployare un'istanza con `APP_HOSTNAME=evil.com` in dotenv,
  caricare una pagina marketing, ispezionare i link `/login`/`/register`
  → devono puntare a `https://app.scontrinozero.it`, non a `evil.com`.

---

### M5. `notifyOperatorOfNewSignup` + welcome email — guard di idempotenza non durable

**Categoria**: Architecture
**File**: `src/server/onboarding-actions.ts:320-332`, `:440-454`;
`src/lib/operator-notification.ts:18-46`

**Descrizione.** Il commit 6cc4057 ha già corretto un bug reale: prima
gating su `cred.verifiedAt`, ora gating su `businessSnapshot.fiscalCode`.
Questo previene il caso "utente sostituisce credenziali AdE e re-verifica"
da ricevere una seconda welcome email.

Però la guard è **stateful sul dato di business** (`fiscalCode`) e non
sull'**evento "notifica già inviata"**. Edge case rimanenti:

1. **Reset manuale di `fiscalCode` da supporto/migration**: una procedura
   amministrativa che azzera `businesses.fiscalCode` (es. fix di un'errata
   import iniziale di P.IVA) farebbe re-firare la welcome + operator email
   alla prossima `verifyAdeCredentials`, anche se l'utente è iscritto da
   mesi.

2. **Re-send esplicito impossibile**: se in futuro il template welcome
   email cambia e si vuole rispedire a tutti, non c'è un flag DB su cui
   intervenire.

3. **Audit trail mancante**: non c'è modo, dato un `business`, di sapere
   "è stata inviata la welcome email? Quando?". Pollutes l'analisi
   supporto.

Per chiarezza: il presunto "race condition concurrent verify" (due
chiamate `verifyAdeCredentials` simultanee che entrambi vedono
`fiscalCode=null`) è **mitigato** dall'optimistic locking su
`adeCredentials.updatedAt` (riga 418-427): solo una delle due UPDATE matcha,
la seconda ritorna prima del send. Non è un finding.

**Fix.**

1. Migration handwritten `supabase/migrations/NNNN_business_signup_notifications.sql`:

   ```sql
   -- Aggiunge flag per idempotenza email di onboarding. NULL = mai inviata.
   ALTER TABLE businesses
     ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz,
     ADD COLUMN IF NOT EXISTS operator_notified_at timestamptz;

   -- Backfill: tutti i business con fiscalCode non NULL al momento della
   -- migrazione sono considerati "già onboarded" → marcare come già inviata
   -- usando created_at come timestamp surrogato (lossy ma sufficiente per
   -- non re-firare alla prossima verifica).
   UPDATE businesses
     SET welcome_email_sent_at = created_at,
         operator_notified_at = created_at
     WHERE fiscal_code IS NOT NULL
       AND welcome_email_sent_at IS NULL;
   ```

   Entry in `supabase/migrations/meta/_journal.json` (idx incrementale,
   `when = Date.now()`).

2. Update Drizzle schema in `src/db/schema/businesses.ts`: aggiungere
   `welcomeEmailSentAt` e `operatorNotifiedAt` (`timestamp({ withTimezone: true })`).

3. In `src/server/onboarding-actions.ts:320-332`, cambiare lo snapshot:

   ```ts
   const [businessSnapshot] = await db
     .select({
       fiscalCode: businesses.fiscalCode,
       welcomeEmailSentAt: businesses.welcomeEmailSentAt,
       operatorNotifiedAt: businesses.operatorNotifiedAt,
     })
     .from(businesses)
     .where(eq(businesses.id, businessId))
     .limit(1);
   ```

4. Dentro la `db.transaction` (riga 380-392), aggiungere il set dei
   timestamp:

   ```ts
   await db.transaction(async (tx) => {
     await tx
       .update(businesses)
       .set({
         vatNumber,
         fiscalCode,
         welcomeEmailSentAt: businessSnapshot?.welcomeEmailSentAt ?? new Date(),
         operatorNotifiedAt: businessSnapshot?.operatorNotifiedAt ?? new Date(),
       })
       .where(eq(businesses.id, businessId));
     // ... rest invariato
   });
   ```

5. Cambiare la guard a riga 443 da `!wasAlreadyOnboarded` a:

   ```ts
   if (!businessSnapshot?.welcomeEmailSentAt && user.email) {
     void sendEmail(...).catch(...);
   }
   if (!businessSnapshot?.operatorNotifiedAt) {
     void notifyOperatorOfNewSignup(user.id).catch(...);
   }
   ```

6. Aggiornare il test `src/server/onboarding-actions.test.ts` (specie
   il blocco "does not re-send welcome email after credential reset" a
   riga 818-851) per coprire il nuovo gate basato sul flag, non più su
   `fiscalCode`.

7. Aggiornare la skill `db-migrations` solo se introduci una nuova
   convention di backfill.

**Verifica.**
- `npm run test -- onboarding-actions` (verde dopo aggiornamento mock)
- `node scripts/check-migrations.mjs`
- `npx tsx scripts/migrate.ts` su DB locale, ri-eseguire per verificare
  idempotenza (pattern `ADD COLUMN IF NOT EXISTS` + `UPDATE WHERE … IS NULL`)
- Manuale: in DB locale, settare `welcome_email_sent_at = NOW()` su un
  business test, eseguire `verifyAdeCredentials` → confermare che NESSUNA
  email viene inviata (mock Resend non chiamato).

---

### M6. Duplicazione `getStalePendingThresholdMs()` tra receipt-service e void-service

**Categoria**: Architecture (DRY drift)
**File**: `src/lib/services/receipt-service.ts:56-61`,
`src/lib/services/void-service.ts:40-45`

**Descrizione.** La funzione è **identica byte-per-byte** nei due file.
Stessa env var (`STALE_PENDING_THRESHOLD_MINUTES`), stesso default (30
min), stesso parsing (`parseFloat`, `Number.isFinite && > 0`).

Drift rischio: se in futuro si vuole differenziare la soglia per sale vs
void (es. void recovery più conservativa perché più rischioso duplicare
un annullamento), si rischia di modificarne uno e dimenticare l'altro.

Il PLAN.md ha già un'entry P3 "Centralizzare policy retry/timeout su
chiamate esterne" ma quel backlog parla di `retryTransient` e
`withExternalTimeout` — questa è una funzione separata di parsing env,
fuori scope di quell'entry.

**Fix.**

1. Creare `src/lib/services/ade-recovery.ts` (o `src/lib/services/stale-threshold.ts`):

   ```ts
   /**
    * Soglia oltre la quale un documento commerciale PENDING/ERROR è
    * considerato "stale" e può entrare nel recovery path. Default: 30 min.
    * Override via env `STALE_PENDING_THRESHOLD_MINUTES`.
    *
    * Condiviso fra receipt-service e void-service per evitare drift:
    * la soglia governa lo stesso trade-off (collision window vs UX
    * di retry) in entrambi i flussi.
    */
   export function getStalePendingThresholdMs(): number {
     const raw = process.env.STALE_PENDING_THRESHOLD_MINUTES;
     const minutes = raw ? Number.parseFloat(raw) : Number.NaN;
     const effective = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
     return effective * 60 * 1000;
   }
   ```

2. In `src/lib/services/receipt-service.ts` rimuovere la funzione locale
   (riga 56-61) e importare da `./ade-recovery`.

3. Idem in `src/lib/services/void-service.ts` (riga 40-45).

4. Aggiornare i test eventualmente affected (i test attuali non sembrano
   mockare la funzione, ma verificare con
   `grep -rn "getStalePendingThresholdMs\|STALE_PENDING_THRESHOLD" src/ tests/`).

5. Aggiungere `src/lib/services/ade-recovery.test.ts` con:
   - Default 30 min quando env non set
   - Override custom (es. `60` → 3,600,000 ms)
   - Edge case (env `0`, `-1`, `abc`, `NaN`) → tutti ritornano 30 min

**Verifica.**
- `grep -rn "getStalePendingThresholdMs" src/ tests/` → 1 sola definizione
- `npm run test -- services`

**PLAN.md cross-ref.** Parzialmente correlato a P3 "Centralizzare policy
retry/timeout". Può essere fatto come precursore (più piccolo, più
focalizzato).

---

## Low

### L1. `computeProductBreakdown` ordinamento con `localeCompare` senza locale

**Categoria**: Bug (determinismo cross-environment)
**File**: `src/server/analytics-helpers.ts:391-395`

**Descrizione.** Il tiebreak alfabetico per prodotti con stesso `revenueCents`:

```ts
entries.sort((a, b) => {
  if (b.revenueCents !== a.revenueCents)
    return b.revenueCents - a.revenueCents;
  return a.sortKey.localeCompare(b.sortKey);
});
```

`localeCompare` senza argomenti usa il locale di default di Node, che in
container Linux può essere `C`, `en_US.UTF-8`, o (raramente) `it_IT.UTF-8`
a seconda del Dockerfile e del sistema host. Per chiavi con accenti
(`"caffè"` vs `"caffé"`) o casing diverso, il tiebreak può produrre
ordini diversi tra dev local, CI, container produzione e container
sandbox. Quando il `topN` è limitato (default 10), prodotti diversi
possono essere inclusi/esclusi tra request consecutive.

Il caso `revenueCents` esattamente uguale è raro ma reale: due prodotti
con prezzo identico venduti lo stesso numero di volte.

**Fix.**

In `src/server/analytics-helpers.ts:394`, usare confronto Unicode puro
(stable, no-locale):

```ts
entries.sort((a, b) => {
  if (b.revenueCents !== a.revenueCents)
    return b.revenueCents - a.revenueCents;
  if (a.sortKey < b.sortKey) return -1;
  if (a.sortKey > b.sortKey) return 1;
  return 0;
});
```

Aggiungere test in `src/server/analytics-helpers.test.ts`:

```ts
it("uses byte-wise Unicode order for tiebreak (no locale)", () => {
  // 'caffè' (U+00E8) vs 'caffé' (U+00E9): byte-wise è -1 ≠ locale-wise.
  // Il test fissa l'ordine atteso per il confronto puro.
  const docs = [
    { id: "d1", status: "ACCEPTED", createdAt: new Date() },
  ];
  const linesByDoc = new Map([
    ["d1", [
      { description: "caffè", quantity: "1", grossUnitPrice: "2" },
      { description: "caffé", quantity: "1", grossUnitPrice: "2" },
    ]],
  ]);
  const out = computeProductBreakdown(docs as any, linesByDoc);
  expect(out[0]?.description).toBe("caffè");
  expect(out[1]?.description).toBe("caffé");
});
```

**Verifica.** `npm run test -- analytics-helpers`.

---

### L2. `logger.error({}, "Transaction returned no document ID")` senza context

**Categoria**: Bad Practice (observability)
**File**: `src/lib/services/receipt-service.ts:187`

**Descrizione.** Il log con object vuoto è un dead branch difensivo (TS
garantisce `txResult.id: string` se `alreadyExists: false`). Però se mai
triggerasse a runtime (es. drift Drizzle, edge case su `onConflictDoNothing`),
il log non contiene **alcun** context per identificare la richiesta:
niente businessId, niente idempotencyKey, niente requestId. Inutile per
incident response.

**Fix.**

```ts
if (!documentId) {
  logger.error(
    {
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      critical: true,
    },
    "Transaction returned no document ID",
  );
  return { error: "Errore interno: impossibile creare il documento." };
}
```

Il flag `critical: true` è già nell'allowlist `SAFE_KEYS` di
`sanitizeForTelemetry` (`src/lib/logger.ts:80`) e coerente con altri log
critici del file (es. riga 403).

**Verifica.** Branch irraggiungibile per costruzione; non serve test.
Code review check + grep `logger.error({},` su `src/` per verificare che
non ci siano altri log senza context.

---

### L3. Tooltip recharts con border `rgba(0,0,0,0.08)` non dark-mode aware

**Categoria**: Bad Practice (UX/A11y)
**File**: `src/components/analytics/product-breakdown.tsx:77-81`

**Descrizione.** Il tooltip ha border nero trasparente fisso. In dark
mode (classe `.dark` sul root o `prefers-color-scheme: dark`) il bordo
si confonde con lo sfondo scuro: contrast border/background <3:1
(WCAG 2.1 SC 1.4.11). Il `PLAN.md` cluster carryover v1.3.0 item (b)
include esplicitamente "tooltip leggibile in dark mode" per gli altri
widget recharts; il nuovo widget ripropone il bug.

**Fix.**

Sostituire `contentStyle` con CSS var del design system shadcn:

```tsx
<Tooltip
  labelFormatter={(label) =>
    typeof label === "string" ? label : String(label)
  }
  formatter={(value) => [
    typeof value === "number" ? formatCurrency(value) : String(value),
    "Ricavi",
  ]}
  contentStyle={{
    borderRadius: 8,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    fontSize: 12,
  }}
/>
```

Le var `--border`, `--popover`, `--popover-foreground` sono definite in
`src/app/globals.css` (o equivalente) per entrambi i temi.

Applicare lo stesso intervento agli altri widget citati in PLAN.md (b)
con la stessa fix.

**Verifica.** Manuale: aprire `/dashboard/analytics` con
`document.documentElement.classList.add('dark')` (DevTools console),
passare sopra una barra → verificare bordo visibile e contrast ≥3:1
(DevTools → Accessibility → Contrast).

**PLAN.md cross-ref.** Cluster carryover v1.3.0 item (b).

---

### L4. `BarChart` di product-breakdown senza `aria-label`

**Categoria**: Bad Practice (a11y)
**File**: `src/components/analytics/product-breakdown.tsx:41-86`

**Descrizione.** Il `ResponsiveContainer/BarChart` di recharts produce
un `<svg>` senza nome accessibile. Screen reader leggono "graphic" o lo
saltano del tutto. Il `PLAN.md` cluster carryover v1.3.0 item (b) include
"aria-label su `<svg>` recharts"; il nuovo widget aggiunge un altro caso.

**Fix.**

Avvolgere il chart in un container con `role="img"` + `aria-label`
descrittivo e aggiungere una caption testuale `sr-only` con i dati
salienti:

```tsx
return (
  <div
    role="img"
    aria-label={`Grafico ricavi per prodotto. Top ${data.length} prodotti del periodo selezionato.`}
    className="h-[260px] w-full"
  >
    <span className="sr-only">
      {data
        .map((e) => `${e.description}: ${formatCurrency(e.revenueCents / 100)}`)
        .join(". ")}
    </span>
    <ResponsiveContainer width="100%" height="100%">
      {/* ... rest invariato ... */}
    </ResponsiveContainer>
  </div>
);
```

Stessa fix da applicare ai widget citati in PLAN (b).

**Verifica.**
- Test automatico in `src/components/analytics/product-breakdown.test.tsx`:
  ```ts
  it("exposes an accessible name for screen readers", () => {
    render(<ProductBreakdown data={[/* ... */]} />);
    expect(
      screen.getByRole("img", { name: /grafico ricavi per prodotto/i }),
    ).toBeInTheDocument();
  });
  ```
- Manuale: NVDA/VoiceOver → tab al grafico, conferma di sentire il nome
  + lista voce.

**PLAN.md cross-ref.** Cluster carryover v1.3.0 item (b).

---

## Informational

### I1. `getAnalyticsDataset` fetcha sempre `publicRequest` jsonb

**File**: `src/server/analytics-actions.ts:255-260`

Il commento (riga 256-258) giustifica `includePublicRequest: true` con
"pagare un campo jsonb in piu' una volta sola e' molto piu' economico
di 3 fetch separate". La premessa "una volta sola" vale per il render
RSC iniziale (cache dedupe). Falsa per il client range change (vedi
**H1**): il jsonb viene fetched **4 volte**.

Non c'è azione separata: chiudere **H1** rende la giustificazione del
commento corretta. Se H1 venisse risolto in altro modo (es. tenendo le 4
azioni separate), valutare di passare `includePublicRequest: false`
nelle azioni che non lo usano (`getAnalyticsKpis`, `getRevenueTimeseries`,
`getProductBreakdown`).

---

### I2. Pattern "AdE rejected → log+update REJECTED+generic message" duplicato

**File**: `src/lib/services/receipt-service.ts:504-538`,
`src/lib/services/void-service.ts:250-285`

I due blocchi sono strutturalmente identici:
- map `adeResponse.errori?.codice` e `descrizione` con fallback `[]`
- `logger.warn` con shape uguale (cambia solo `documentId` vs
  `voidDocumentId`+`saleDocumentId`)
- `retryOnStatementTimeout` con label diversa
- `update commercialDocuments set status: 'REJECTED', adeResponse: ...`
- `return { error: "<messaggio generico Italiano>" }`

Estrazione possibile in helper
`markDocumentRejected(doc, adeResponse, opts: { logger, retryLabel, userMessage })`.
Beneficio marginale finché PLAN.md P3 "Centralizzare policy retry/timeout"
non viene affrontato; il pattern markRejected è un buon candidato per
quell'iniziativa.

**PLAN.md cross-ref.** Parzialmente sovrapposto a P3.

---

## Appendice: cross-reference `PLAN.md`

I finding sotto rinviano a entry già in `PLAN.md`. Sono inclusi qui solo
perché il nuovo diff li aggrava o li tocca direttamente.

| Finding | Entry PLAN.md | Rapporto |
|---|---|---|
| **M1** (recharts dynamic) | P3 "`recharts` dynamic import" | Estende lo scope a `product-breakdown.tsx`. Risolvere M1 chiude anche P3. |
| **M3** (logger.error → warn) | P3 "Error envelope uniforme API" + P3 "Centralizzare policy retry/timeout" | Sotto-task: classificazione transient/permanent è una capability necessaria per entrambe le entry. |
| **M6** (DRY threshold) | P3 "Centralizzare policy retry/timeout su chiamate esterne" | Precursore: piccolo step nella stessa direzione. |
| **I2** (DRY rejected pattern) | P3 "Centralizzare policy retry/timeout" | Idem. |
| **L3** (tooltip dark mode) | Cluster carryover v1.3.0 item (b) | Aggrava: terzo widget recharts con stesso bug. |
| **L4** (aria-label SVG) | Cluster carryover v1.3.0 item (b) | Aggrava: terzo widget recharts senza accessible name. |

Entry `PLAN.md` correlate ai file modificati ma **non aggravate** dal
diff (omesse dalla review per evitare duplicate):

- P3 "Test gap coverage" (cluster carryover) — esclusi per scelta utente.
- P3 "`waitUntil` per fire-and-forget DB update" — i fire-and-forget
  introdotti dal diff (`notifyOperatorOfNewSignup`, `sendEmail`) seguono
  lo stesso pattern `.catch()` esistente, nessun cambio architetturale.
- P3 "Eliminare `'unsafe-inline'` da `script-src`" — non toccato.
- P3 "TTL/revoca link pubblici scontrini" — non toccato.

---

## Metodo

Per riferimento futuro: questa review è stata costruita con
- `git log/diff v1.3.2..HEAD`
- 3 agent Explore in parallelo (analytics, AdE/services, onboarding/auth)
- Verifica diretta dei finding critici (regex hook testata con Python,
  comportamento `cache()` cross-Server-Action verificato per documentazione
  Next.js 15+)
- Letture mirate di `receipt-service.ts`, `void-service.ts`,
  `analytics-helpers.ts`, `analytics-actions.ts`, `marketing-to-app-href.ts`,
  `operator-notification.ts`, `logger.ts`, `error-messages.ts`
- Cross-reference con `PLAN.md` completo
