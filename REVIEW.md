# REVIEW — Audit react-doctor

> **Tool:** `react-doctor@0.2.10` · **Comando:** `npx react-doctor@latest --full`
> · **Data:** 2026-05-28
>
> **Scan grezzo:** 309 finding (44 error, 265 warning) su 127 file.
> **Metodologia:** ogni finding è stato triato leggendo il codice. Questo
> documento include **solo i finding verificati come azionabili** e **non già
> coperti da `PLAN.md`**. Sono stati esclusi a monte: falsi positivi (la
> maggioranza degli _error_, es. `server-auth-actions` su action che già usano
> `getAuthenticatedUser()`), pattern intenzionali (JSON-LD escapato, `<a>` verso
> API route, `role="img"` sui grafici recharts), il cleanup Tailwind cosmetico
> (`w-4 h-4 → size-4`), e gli item già a roadmap (recharts via `next/dynamic`,
> paginazione `getCatalogItems`).
>
> Ogni voce è autosufficiente: un agente AI può applicare il fix senza ulteriore
> contesto. I numeri di riga si riferiscono allo stato del repo alla data di
> scansione — riallineare con un `grep` se il file è cambiato.

## Riepilogo

| ID  | Tema                                              | Severità | Occorrenze | Priorità |
| --- | ------------------------------------------------- | -------- | ---------- | -------- |
| R1  | Antipattern state/effect + Suspense in CassaClient | warning  | 9          | Alta     |
| R2  | Parallelizzare `await` indipendenti (perf)        | warning  | 5 (+3)     | Media    |
| R3  | Hoist formatter `Intl` a module scope (perf)      | warning  | 7          | Media    |
| R4  | Label accessibili sui controlli (a11y)            | warning  | 4          | Media    |
| R5  | Elementi semantici al posto di `role` (a11y)      | warning  | 4          | Media    |
| R6  | `type` esplicito sui `<button>` (correttezza)     | warning  | 8          | Media    |
| R7  | Key stabile invece di indice array (correttezza)  | warning  | 1          | Media    |
| R8  | `metadata` mancante su pagine marketing (SEO)     | warning  | 3          | Media    |
| R9  | Hydration mismatch su `new Date()` in JSX         | warning  | 2          | Bassa    |
| R10 | Dead code / dipendenze inutilizzate (pulizia)     | warning  | 6          | Bassa    |
| R11 | Micro-ottimizzazioni perf                         | warning  | 2          | Bassa    |
| R12 | Minori correttezza / modernizzazione              | warning  | 4          | Bassa    |

> **Convenzione TDD (CLAUDE.md regola 2):** dove un fix tocca logica, scrivere
> prima il test. Ogni voce indica come verificare l'esito.

---

## [Alta] R1 — Antipattern state/effect + Suspense in CassaClient

**Regola:** `nextjs-no-use-search-params-without-suspense`, `no-initialize-state`,
`no-derived-state`, `no-event-handler`, `exhaustive-deps`, `no-chain-state-updates`,
`nextjs-no-client-side-redirect`
**File:** `src/components/cassa/cassa-client.tsx`, `src/hooks/use-cassa.ts`

**Problema.** Il componente POS concentra più antipattern React/Next correlati:

- `cassa-client.tsx:36` — `useSearchParams()` **senza boundary `<Suspense>`**.
  È il più concreto: in produzione costringe l'intera pagina al rendering
  client-side (CSR bailout), peggiorando il TTFB e potenzialmente rompendo la
  build statica.
- `cassa-client.tsx:110-112` e `use-cassa.ts:58` — stato inizializzato dentro un
  `useEffect` (`description`, `vatCode`, `step`) invece che nell'inizializzatore
  di `useState`.
- `cassa-client.tsx:111` — `vatCode` è **stato derivato**: andrebbe calcolato in
  render (eventualmente con `useMemo`), non memorizzato.
- `cassa-client.tsx:168` — effetto usato come event-handler.
- `cassa-client.tsx:117` — `useEffect` con dipendenze mancanti
  (`searchParams.get`, `addLine`, `router.replace`).
- `cassa-client.tsx:170` — chaining di aggiornamenti di stato consecutivi.
- `cassa-client.tsx:94,114` — `router.replace()` dentro `useEffect`.

**Fix.**

1. Avvolgere il sottoalbero che usa `useSearchParams()` in un `<Suspense>`
   (o spostare la lettura dei searchParams in un Server Component genitore che li
   passa come prop).
2. Inizializzare `description`/`step` con il valore corretto direttamente in
   `useState(() => ...)` (init lazy), eliminando l'effetto di sincronizzazione.
3. Derivare `vatCode` in render invece di salvarlo in stato.
4. Completare le dipendenze dell'`useEffect` o estrarre l'handler.

**Cautele / edge case.** Alcuni effetti **prefillano lo stato da searchParams**
(deep-link al POS, es. `?productId=`). Verificare l'intento prima di rimuovere:
la prefill da query va preservata, semplicemente spostandola nell'init di
`useState` / in un Server Component genitore. Non rimuovere `router.replace`
senza capire se serve a "pulire" la query dopo la lettura.

**Verifica.** Test di rendering e interazione della cassa verdi; `npm run build`
senza warning "useSearchParams should be wrapped in a suspense boundary";
emissione scontrino ancora istantanea (optimistic UI).

---

## [Media] R2 — Parallelizzare `await` indipendenti (perf)

**Regola:** `server-sequential-independent-await` (+ `async-await-in-loop`)
**File:**

- `src/app/api/v1/receipts/route.ts:295`
- `src/app/api/export/receipts/route.ts:63`
- `src/app/dashboard/settings/page.tsx:31`
- `src/server/storico-actions.ts:113`
- `src/server/catalog-actions.ts:135`

**Problema.** `await` sequenziali senza dipendenza di dato sul risultato
precedente: le operazioni potrebbero girare in parallelo.

**Fix.** Accorpare le chiamate indipendenti in `Promise.all([...])`.

**Cautele / edge case.** **Confermare l'assenza di data-dependency** prima di
accorpare (la seconda chiamata non deve usare il risultato della prima). Mantenere
la gestione errori: con `Promise.all` il primo reject interrompe tutto — se serve
tolleranza parziale usare `Promise.allSettled`.

**Sotto-nota (`async-await-in-loop`).** Verificare i 3 loop nelle server action:
`profile-actions.ts:333`, `account-actions.ts:48`, `auth-actions.ts:238`. Gli
altri hit della stessa regola (`src/lib/request-utils.ts`, `src/lib/db-timeout.ts`,
`src/lib/ade/real-client.ts`) sono **retry/backoff sequenziali per design** e
**non vanno toccati**.

**Verifica.** Test esistenti invariati, stessi risultati; nessuna regressione su
gestione errori delle API.

---

## [Media] R3 — Hoist formatter `Intl` a module scope (perf)

**Regola:** `js-hoist-intl`
**File:**

- `src/lib/date-utils.ts:22`, `:34`, `:52`
- `src/lib/receipt-format.ts:19`
- `src/lib/utils.ts:12`
- `src/components/analytics/kpi-cards.tsx:14`
- `src/lib/pdf/generate-sale-receipt.ts:48`

**Problema.** `new Intl.NumberFormat()` / `new Intl.DateTimeFormat()` costruiti
dentro una funzione: la creazione di un formatter `Intl` è costosa e qui viene
ripetuta a ogni chiamata.

**Fix.** Spostare l'istanza a una costante di modulo (top-level). In componenti
React, se le opzioni dipendono da props, usare `useMemo`.

**Cautele / edge case.** I formatter con **locale o timezone dinamici** (passati
come argomento) NON sono hoistabili come singola costante: lasciarli o usare una
cache `Map` per locale. Verificare che locale/options siano costanti prima di
spostare.

**Verifica.** Output di formattazione identico — coperto dai test unit
`receipt-format` / `date-utils`; aggiungere assert se mancano.

---

## [Media] R4 — Label accessibili sui controlli (a11y)

**Regola:** `control-has-associated-label`
**File:** `src/app/(marketing)/prezzi/page.tsx:136`, `:151`;
`src/components/marketing/comparison-table.tsx:45`, `:78`

**Problema.** Controlli interattivi senza testo/label associata: invisibili agli
screen reader.

**Fix.** Aggiungere testo visibile, `aria-label`, o `aria-labelledby`. Scegliere
una label che descriva l'azione (es. "Scegli piano Pro", "Confronta funzionalità").

**Verifica.** Nessun warning a11y residuo su quei file; se presente, test axe.

---

## [Media] R5 — Elementi semantici al posto di `role` (a11y)

**Regola:** `prefer-tag-over-role` (+ `click-events-have-key-events`,
`interactive-supports-focus`)
**File:**

- `src/components/marketing/tools/calcolatore-risparmio-tool.tsx:50` —
  `role="status"` → `<output>`
- `src/components/marketing/tools/verifica-lotteria-tool.tsx:62` —
  `role="status"` → `<output>`
- `src/components/marketing/tools/scorporo-iva-tool.tsx:77` —
  `role="status"` → `<output>`
- `src/components/ui/date-range-picker.tsx:68-69` — `role="button"` su elemento
  generico → `<button>` reale. Risolve anche `click-events-have-key-events` e
  `interactive-supports-focus` sulla stessa riga (un `<button>` è già tabbabile e
  attiva con tastiera).

**Problema.** Ruoli ARIA applicati a tag generici (`<div>`/`<span>`) dove esiste
l'elemento semantico nativo, che porta accessibilità e gestione tastiera gratis.

**Fix.** Sostituire con l'elemento nativo (`<output>` per i risultati live dei
tool, `<button type="button">` per il trigger del date-picker), rimuovendo
`role`/`tabIndex`/handler tastiera manuali ridondanti.

**Escludere (intenzionali).** I 3 widget recharts con `role="img"`
(`payment-breakdown.tsx`, `revenue-sparkline.tsx`, `product-breakdown.tsx`): l'SVG
inline del grafico non è un `<img>`; il `role="img"` + `aria-label` è la scelta
a11y voluta (PLAN.md, PR-Low post-v1.3.2).

**Verifica.** Navigazione da tastiera e focus sul date-picker; i risultati dei
tool annunciati come live region.

---

## [Media] R6 — `type` esplicito sui `<button>` (correttezza)

**Regola:** `button-has-type`
**File:**

- `src/app/global-error.tsx:21`
- `src/components/marketing/pricing-section.tsx:64`, `:74`
- `src/components/billing/plan-selection.tsx:30`, `:40`
- `src/components/pwa/install-prompt.tsx:74`, `:145`, `:151`

**Problema.** `<button>` senza `type` esplicito: il default HTML è `submit`, che
dentro un `<form>` provoca submit/refresh non voluti.

**Fix.** Aggiungere `type="button"` ai pulsanti d'azione. **Lasciare
`type="submit"`** solo ai bottoni che inviano davvero un form.

**Verifica.** Nessun submit accidentale; i bottoni di submit reali restano tali.

---

## [Media] R7 — Key stabile invece di indice array (correttezza)

**Regola:** `no-array-index-as-key`
**File:** `src/components/storico/void-receipt-dialog.tsx:162`

**Problema.** `key={index}` su una lista: causa bug di stato/animazione quando la
lista viene riordinata o filtrata.

**Fix.** Usare un id stabile dell'elemento (es. id della riga documento). Se gli
elementi non hanno id univoco, comporre una chiave da campi stabili.

**Verifica.** Il rendering della lista resta corretto dopo filtro/riordino.

---

## [Media] R8 — `metadata` mancante su pagine marketing (SEO)

**Regola:** `nextjs-missing-metadata`
**File:**

- `src/app/(marketing)/page.tsx` — **homepage**
- `src/app/(marketing)/privacy/page.tsx`
- `src/app/(marketing)/cookie-policy/page.tsx`

**Problema.** Pagine senza `export const metadata` né `generateMetadata`: niente
`title`/`description`/OG dedicati. La homepage in particolare è critica — la SEO è
la leva di crescita #1 del progetto (PLAN.md).

**Fix.** Aggiungere `export const metadata: Metadata = { title, description, ... }`
(allineato al pattern delle altre pagine marketing, es. `prezzi`/`funzionalita`).
Verificare prima se il `layout.tsx` marketing fornisce già un default da
sovrascrivere.

**Escludere.** `termini/page.tsx` (è un `redirect()` → non serve metadata);
`onboarding/page.tsx` e `offline/page.tsx` (pagine app/PWA, non SEO).

**Verifica.** `metadata` presente con title/description sensati; eventuale test
snapshot SEO.

---

## [Bassa] R9 — Hydration mismatch su `new Date()` in JSX

**Regola:** `rendering-hydration-mismatch-time`
**File:** `src/components/marketing/footer.tsx:137` (anno copyright);
`src/components/ui/date-range-picker.tsx:84`

**Problema.** `new Date()` raggiungibile dal JSX produce output diverso tra render
server e client (rischio di mismatch di hydration al cambio di anno/fuso).

**Fix.** Per l'anno copyright nel footer: o calcolarlo lato server e passarlo come
prop, o renderlo client-only (`useEffect`+state), o `suppressHydrationWarning` se
la differenza è accettabile. Per il date-picker valutare il default lato client.

**Verifica.** Nessun warning di hydration in console.

---

## [Bassa] R10 — Dead code / dipendenze inutilizzate (pulizia)

**Regola:** `unused-export`, `unused-dependency`, `unused-dev-dependency`
**File / target:**

- `src/lib/ade/types.ts:37` — export `ADE_VAT_CODE_REGEX` inutilizzato
- `tests/_helpers/fixtures.ts:13` — export `TEST_RELATED_ID` inutilizzato
- `scripts/migrate.ts:7`, `:71` — export `computeChecksum`, `checkSchemaInvariants`
- `package.json` — dependency `@react-email/render` inutilizzata
- `package.json` — devDependency `pino-pretty` inutilizzata

**Problema.** Export e dipendenze senza consumatori → rumore e bundle/lockfile più
pesanti.

**Fix.** Rimuovere export e dipendenze realmente inutilizzati.

**Cautele OBBLIGATORIE (verificare prima di rimuovere).**

- `scripts/migrate.ts`: gli export potrebbero essere usati da `check-migrations.mjs`
  o dai test CI — `grep -rn "computeChecksum\|checkSchemaInvariants"` prima.
- `@react-email/render`: potrebbe essere richiesto a runtime da `react-email` /
  dal rendering email Resend anche senza import diretto — verificare l'invio email.
- `pino-pretty`: tipicamente usato come **transport pino in dev** (referenziato per
  stringa, non importato) — verificare la config logger prima di toglierlo.

**Verifica.** `npm run build` + `npm run test` verdi; logging dev ed email
funzionanti.

---

## [Bassa] R11 — Micro-ottimizzazioni perf

**Regola:** `js-set-map-lookups`, `js-combine-iterations`
**File:**

- `src/lib/ade/cookie-jar.ts:23` — `array.indexOf()` in un loop (O(n) per call) →
  costruire un `Set` per lookup O(1).
- `src/app/r/[documentId]/page.tsx:131` — `.filter().map()` itera l'array due
  volte → combinare in un singolo `reduce`/loop.

**Verifica.** Output invariato (stessi elementi/ordine).

---

## [Bassa] R12 — Minori correttezza / modernizzazione

- **`rerender-state-only-in-handlers`** — `src/app/onboarding/onboarding-form.tsx:106`:
  lo `useState` `businessId` è aggiornato ma mai letto nel return → se serve solo
  tra handler, usare un `useRef` (evita re-render inutili).
- **`no-render-in-render`** — `src/components/marketing/comparison-table.tsx:66`,
  `:69`: funzione `renderCell()` inline → estrarre in un componente dedicato per
  permettere la memoizzazione.
- **`no-react19-deprecated-apis`** (opzionale) — `src/components/ui/form.tsx:46`,
  `:47`: `useContext` → `use()` (React 19). File shadcn vendored: applicare solo se
  si tocca comunque il file, per coerenza con `react-patterns`.

**Verifica.** Nessuna regressione funzionale; form e tabella di confronto invariati.
