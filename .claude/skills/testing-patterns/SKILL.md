---
name: testing-patterns
description: Use when writing or fixing Vitest tests — avoiding SonarCloud S6661 Blocker (every it()/test() must have at least one expect()), mocking classes correctly with function/class keyword (never arrow), prefixing vi.mock factory variables with "mock" for hoisting, mocking Drizzle's db.transaction() callback with a passthrough, stubbing NODE_ENV with vi.stubEnv, updating mocks after refactoring N queries into a JOIN, INSERT ON CONFLICT DO NOTHING for race conditions, sanitizing context before Sentry.captureException via sanitizeForTelemetry(), auth-first ordering in deleteAccount, conditional last_used_at writes to prevent write-amplification, or react/cache deduplication across RSC and Route Handlers. Also lists the consolidated rate-limit thresholds for server actions (emit/void/pdf/checkout/portal/auth).
---

# testing-patterns — Vitest patterns e regole CI

Lezioni operative per evitare i failure più comuni di SonarCloud e i bug silenziosi
nei mock.

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
- Auth actions — 5/15min per-IP

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
