---
name: testing-patterns
description: Use when writing or fixing Vitest tests — avoiding SonarCloud S6661 Blocker (every it()/test() must have at least one expect()), mocking classes correctly with function/class keyword (never arrow), prefixing vi.mock factory variables with "mock" for hoisting, mocking Drizzle's db.transaction() callback with a passthrough, stubbing NODE_ENV with vi.stubEnv, updating mocks after refactoring N queries into a JOIN, INSERT ON CONFLICT DO NOTHING for race conditions, sanitizing context before Sentry.captureException via sanitizeForTelemetry(), auth-first ordering in deleteAccount, conditional last_used_at writes to prevent write-amplification, react/cache deduplication across RSC and Route Handlers, simulating a hostile browser (sessionStorage/localStorage throwing SecurityError, in-app webview, cookies disabled) for UI components that read Web Storage, or mocking Sentry.withScope + scope.setFingerprint when testing logger.ts fingerprint-aware capture. Also lists the consolidated rate-limit thresholds for server actions (emit/void/pdf/checkout/portal/auth).
---

# testing-patterns — Vitest patterns e regole CI

Lezioni operative per evitare i failure più comuni di SonarCloud e i bug silenziosi
nei mock.

Indice (salta alla sezione che serve, non leggere tutto):

- Ogni test ha almeno un `expect()` (S6661)
- Mock di classi: `function`/`class`, mai arrow
- Mock tipati: niente spread in `vi.fn()` a zero argomenti (TS2556)
- Rate limiting su server actions (**soglie consolidate — fonte canonica**)
- Aggiornare i mock dopo un refactor in JOIN
- `NODE_ENV` con `vi.stubEnv`
- Mock Drizzle `transaction` (callback riceve `tx`)
- `react/cache` non deduplica tra Route Handler e RSC
- `INSERT ... ON CONFLICT DO NOTHING` per race
- Sentry + pino: sanitize prima di `captureException`
- `deleteAccount`: auth user first
- `last_used_at` condizionale (anti write-amplification)
- Browser ostile (storage bloccato, webview, cookies off)
- Mock di `Sentry.withScope` + `setFingerprint` (R23)

---

## Ogni test deve avere almeno un `expect()`

SonarCloud classifica come **Blocker** qualsiasi `it()`/`test()` senza assertion.
Anche i test che verificano "non lancia eccezione" o "chiama redirect" devono
contenere almeno un `expect()` esplicito.

```typescript
// ❌ SBAGLIATO — SonarCloud Blocker
it("chiama signIn senza errori", async () => {
  try {
    await signIn(formData);
  } catch {
    // redirect expected
  }
});

// ✅ CORRETTO — assertion su effetto osservabile
it("chiama signIn senza errori", async () => {
  try {
    await signIn(formData);
  } catch {
    // redirect expected
  }
  expect(mockSomeFn).toHaveBeenCalled();
});
```

---

## `vi.mock` di classi: usare `function` o `class`, mai arrow function

Quando un modulo esporta una **classe** che viene istanziata con `new`,
il mock deve usare la keyword `function` o `class` nel `mockImplementation`.
Le arrow function non possono essere costruttori e causano:
`TypeError: () => ({...}) is not a constructor`.

Le variabili usate nella factory `vi.mock` **devono iniziare con `mock`**
(Vitest le includa nell'hoisting automatico).

```typescript
// ❌ SBAGLIATO — arrow function non è un costruttore
const mockCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(() => ({ check: mockCheck })),
}));

// ✅ CORRETTO — regular function restituisce l'oggetto mock
const mockCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockCheck };
  }),
}));
```

---

## Mock tipati: niente spread in `vi.fn()` a zero argomenti (TS2556)

Quando mocki una funzione e poi la invochi inoltrandole gli argomenti con uno
spread, il `vi.fn()` ha firma `() => ...` (zero argomenti) e lo spread di
`unknown[]` produce **TS2556** (`A spread argument must either have a tuple
type or be passed to a rest parameter`). `npm run type-check` fallisce _prima_
di eseguire i test — non lo cattura il run. Tipare il mock con la **firma reale**
del modulo mockato (`notFound()` non prende argomenti; `redirect(path)` uno).

```typescript
// ❌ SBAGLIATO — TS2556: spread in un vi.fn() a zero argomenti
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args), // spread → TS2556
  notFound: () => mockNotFound(),
}));

// ✅ CORRETTO — firma reale, nessuno spread inutile
const mockRedirect = vi.fn<(path: string) => never>();
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
  notFound: () => mockNotFound(), // notFound() è zero-arg: non spreddare nulla
}));
```

Ricorrente: PR #553 (`notFound`), #572 (`redirect`), commit f227f81 e 4b2cfca.

---

## Rate limiting su server actions autenticate

Le server actions per utenti autenticati usano chiavi **per-user**.
Le azioni pubbliche (PDF, ecc.) usano chiavi per-IP.

```typescript
const myLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
});

export async function myAction(input: MyInput): Promise<MyResult> {
  const user = await getAuthenticatedUser();

  const rateLimitResult = myLimiter.check(`prefix:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Rate limit exceeded");
    return { error: "Troppe richieste. Riprova tra qualche minuto." };
  }
  // ...
}
```

**Soglie consolidate:**

- `emit:<userId>` — `emitReceipt` → 30/ora
- `void:<userId>` — `voidReceipt` → 10/ora (irreversibile)
- `pdf:<ip>` — PDF pubblico → 60/ora
- `checkout:<userId>` — `POST /api/stripe/checkout` → 10/ora
- `portal:<userId>` — `GET|POST /api/stripe/portal` → 10/ora
- `verify-ade:<userId>` — `verifyAdeCredentials` → 5/15min (REVIEW.md #36)
- `change-ade-pw:<userId>` — `changeAdePassword` → 5/15min
- Auth actions — 5/15min per-IP

> ⚠️ **Aggiungere un rate limit a un'action già testata = mockare `@/lib/rate-limit`
> in OGNI suite che la esercita.** Un nuovo gate introduce un ramo di
> **early-return** prima delle query DB. Una suite che chiama l'action N volte
> con lo **stesso `userId`** lo fa scattare (es. 6° invio su 5/15min), e l'action
> ritorna **prima** di consumare i `mockResolvedValueOnce` accodati nel
> `beforeEach`. `vi.clearAllMocks()` **non** svuota la coda di
> `mockResolvedValueOnce` → l'item non consumato **leakka nel test successivo**,
> sfasando l'ordine delle SELECT (sintomo tipico: un id sbagliato — il `profileId`
> al posto del `businessId`). Stesso modulo, **più file di test** (`src/server/
X.test.ts` **e** `tests/unit/server-X.test.ts`): mockare il limiter in tutti.
> E con `vi.resetAllMocks()` per-`describe`, **re-impostare** il default
> `mockRateLimiterCheck.mockReturnValue({ success: true })` nel `beforeEach`,
> altrimenti `check()` ritorna `undefined` → crash su `.success`. Eseguire
> sempre la **suite intera** (`npm run test:coverage`), non il singolo file:
> un modulo può avere suite parallele in `tests/unit/`.

---

## Aggiornare mock quando si introducono JOIN

Quando si refactora N query separate in un JOIN, **tutti** i file di test che
chiamano (anche indirettamente) la funzione devono aggiornare i mock. Pattern
da cercare:

- Mock di `@/db` con chain `select().from().where().limit()` senza `innerJoin`
- Funzioni nel codice sotto test che chiamano `checkBusinessOwnership` o simili
  **senza mockare `@/lib/server-auth`** → usano la funzione reale, che ora usa JOIN

Fix: aggiungere `innerJoin` al mock chain E ridurre le `mockLimit.mockResolvedValueOnce`
da 2 (profile + business separati) a 1 (risultato JOIN). In alternativa: mockare
sempre `@/lib/server-auth` nei test delle server actions che usano ownership check.

Cerca file affetti con:
`grep -rn "FAKE_PROFILE\|Ownership check" tests/ src/ --include="*.test.ts"`

---

## Testare `NODE_ENV` con `vi.stubEnv`

`process.env.NODE_ENV` **non è direttamente scrivibile** in Vitest. Usare:

```typescript
import { afterEach, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("si comporta diversamente in produzione", () => {
  vi.stubEnv("NODE_ENV", "production");
  // ...
});
```

---

## Mock Drizzle con `transaction`: il callback riceve `tx`, non `db`

Quando il codice usa `db.transaction(async (tx) => { tx.update(...) })`, i test
devono aggiungere `transaction` al mock di `getDb()` come passthrough:

```typescript
const mockTransaction = vi.fn();
mockTransaction.mockImplementation(async (fn) =>
  fn({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
);
```

Senza, il codice chiama `db.transaction(undefined)` → TypeError silenzioso.

---

## `react/cache` non deduplica tra Route Handler e RSC

`cache()` da `react` è scoped al singolo render tree RSC. Non deduplica
tra page RSC `/r/[id]` e Route Handler `/r/[id]/pdf` — sono HTTP request
separate. Preferire plain async function + chiamata diretta al DB in ogni
entry point.

---

## `INSERT ... ON CONFLICT DO NOTHING` per race su creazione riga

Per endpoint concorrenti sullo stesso utente (doppio click su "Checkout"),
"SELECT then INSERT" causa unique-constraint violation → 500. Pattern Drizzle:

```typescript
const [inserted] = await db
  .insert(table)
  .values({ ... })
  .onConflictDoNothing()
  .returning({ col: table.col });

if (!inserted) {
  // Conflict: re-SELECT per il "winner"
  const [existing] = await db.select(...).where(...);
}
```

---

## Sentry + pino: sanitize PRIMA di `captureException`

`pino.redact` gira durante la **serialisation**, ma il hook `logMethod` riceve
l'oggetto **raw** prima della serializzazione. Tutto ciò che viene forwardato a
`Sentry.captureException/captureMessage` da dentro `logMethod` è quindi
**un-redacted**.

Fix: passare il context attraverso `sanitizeForTelemetry()` prima di ogni call
Sentry. Usare un'**allowlist** esplicita (`requestId`, `userId`, `path`,
`documentId`, `adeErrorCodes`, …) piuttosto che denylist.

Pattern in `src/lib/logger.ts`:

```typescript
function captureToSentry(obj: unknown, msg?: string): void {
  const sanitized = sanitizeForTelemetry(obj);
  if (... instanceof Error) {
    Sentry.captureException(err, { extra: sanitized });
  }
}
```

Error objects in `extra` vanno estratti come `{ name, message }` only — lo stack
trace e il cause chain possono incorporare request context (query params, headers)
dal call site.

---

## `deleteAccount`: auth user FIRST

Safe ordering per account deletion: **auth-first**.

1. Delete Supabase Auth user (admin API, 3 retries × backoff)
2. Auth deletion fails → return `{ error }` immediatamente; profile intatto,
   user può fare login e ritentare
3. Auth deletion succeeds → delete profile (FK cascade)
4. Profile deletion fails → log `critical: true`, manual cleanup needed
   (ma auth entry già rimosso, quindi nessun login possibile)

Inverting fix: o nulla è eliminato (safe), o solo orphan profile (less harmful).

---

## `last_used_at` con WHERE condizionale (anti write-amplification)

Per evitare DB write su ogni request:

```typescript
.where(and(
  eq(table.id, id),
  or(isNull(table.lastUsedAt), lt(table.lastUsedAt, threshold))
))
```

Il DB aggiorna solo se `lastUsedAt IS NULL OR lastUsedAt < NOW - N_min`.
Sempre fire-and-forget (`.catch(logger.warn)`). Throttle consigliato: 10 min.

---

## Browser ostile: storage bloccato, in-app webview, cookies off

**Storia (SCONTRINOZERO-H, Chrome Mobile su Android 10, 7 eventi in
2 min):** `sessionStorage`/`localStorage` non sono sempre disponibili.
Su browser in modalità privacy, cookie di terze parti bloccati, o
all'interno di alcune in-app webview, anche solo **accedere alla
property** `window.sessionStorage` lancia `SecurityError`
(DOMException 18) — non basta un try/catch sul singolo `getItem`/`setItem`.
Senza un wrapper safe, il throw dentro un `useEffect` finisce in
Sentry e/o rompe il commit dell'effetto.

**Wrapper canonico:** `src/lib/safe-storage.ts`. `safeSessionStorage` e
`safeLocalStorage` degradano a `null` (lettura) / no-op (scrittura) +
SSR-safe (senza `window` ritornano `null`/no-op). Ogni componente
client che legge Web Storage deve usarli, **mai** `window.localStorage`
diretto.

**Mock pattern per testare la condizione ostile:**

```typescript
// Property-access throw (lo store stesso non è leggibile).
// Mock PRIMA del primo render del componente sotto test.
beforeEach(() => {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("Access denied", "SecurityError");
    },
  });
});

afterEach(() => {
  // Restore via configurable: true sopra.
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: originalSessionStorage,
  });
});

it("non crasha quando sessionStorage lancia SecurityError", () => {
  // Il componente deve usare safeSessionStorage internamente: lo store
  // ritorna null/no-op invece di throware.
  expect(() => render(<MyComponent />)).not.toThrow();
});
```

Per il caso "store leggibile ma `getItem`/`setItem` throw" (quota
exceeded, lockdown mode), basta sovrascrivere i singoli metodi:

```typescript
vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
  throw new DOMException("Quota exceeded", "QuotaExceededError");
});
```

**Cookies disabilitati:** `navigator.cookieEnabled = false`. Tutti gli
auth flow devono degradare con un messaggio ("Abilita i cookie per
continuare") invece di throware. Test pattern speculare allo storage.

Esempio canonico di copertura: `src/lib/safe-storage.test.ts`.

**Gotcha Node ≥ 25 (webstorage nativo vs jsdom):** da Node 25
`localStorage`/`sessionStorage` esistono già su `globalThis`, e
`populateGlobal` di vitest **salta le chiavi già presenti sul global**:
lo Storage di jsdom non viene installato e i test vedono lo stub di Node
— che senza `--localstorage-file` è un oggetto SENZA metodi
(`localStorage.clear is not a function` nei teardown, spy su
`getItem`/`setItem` che falliscono con "property not defined").
`sessionStorage` di Node invece funziona (in-memory), quindi il sintomo
è asimmetrico: falliscono solo i test `localStorage`. Fix canonico:
`execArgv: ["--no-experimental-webstorage"]` in `test` (top-level, i
`poolOptions` non esistono più in vitest 4) dentro `vitest.config.ts`.
Guard fail-fast con messaggio esplicativo:
`tests/_helpers/assert-functional-web-storage.ts`, invocato da
`tests/setup.ts` **solo se `typeof window !== "undefined"`** — i file
con pragma `@vitest-environment node` caricano comunque il setup del
progetto jsdom ma non hanno (né devono avere) Web Storage.

---

## Mock di `Sentry.withScope` + `scope.setFingerprint` (R23)

Quando testi `captureToSentry` in `src/lib/logger.ts` o qualsiasi codice
che chiama `Sentry.withScope(s => s.setFingerprint([...]))`, il mock di
`@sentry/nextjs` deve esporre **withScope come passthrough** che
inietta uno scope finto con il metodo da spiare. Senza passthrough lo
state interno della capture non viene mai eseguito.

```typescript
const mockSetFingerprint = vi.fn();
const mockWithScope = vi.fn(
  (cb: (scope: { setFingerprint: typeof mockSetFingerprint }) => void) => {
    cb({ setFingerprint: mockSetFingerprint });
  },
);

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: mockWithScope,
}));

it("applica il fingerprint quando sentryFingerprint è nel payload", async () => {
  const { logger } = await import("./logger");
  logger.error(
    {
      err: new Error("boom"),
      sentryFingerprint: ["onboarding-verify", "ade_failure"],
    },
    "AdE failed",
  );
  expect(mockWithScope).toHaveBeenCalledOnce();
  expect(mockSetFingerprint).toHaveBeenCalledWith([
    "onboarding-verify",
    "ade_failure",
  ]);
});
```

Casi da testare sempre insieme:

- `sentryFingerprint` array non-empty → `withScope` chiamato.
- `sentryFingerprint` assente / empty array / non-array → `withScope`
  NON chiamato (back-compat con il comportamento default di Sentry
  grouping).
- `sentryFingerprint` NON deve apparire in `extra` dell'eventuale
  `captureException`: è metadato di routing, non payload.

Esempio canonico: `src/lib/logger.test.ts:223`.
