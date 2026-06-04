---
name: react-patterns
description: Use when writing or modifying React 19 / Next.js 16 App Router code in src/app/ or src/components/ — choosing between Server Components and Client Components, marking the client boundary with "use client", reading params/searchParams as Promises, calling cookies()/headers() (async in Next 16), passing server-computed values as props to client components (e.g. appHref() from src/lib/marketing-to-app-href.ts), composing shadcn/ui + Radix primitives, wiring TanStack Query/Table with the providers in src/components/providers.tsx, building forms with react-hook-form + Zod, applying optimistic UI / useTransition / useOptimistic for AdE flows that look instant despite 2-5s latency, ordering Tailwind 4 classes (prettier-plugin-tailwindcss), composing variants with cva + cn (tailwind-merge), and avoiding hydration mismatches with next-themes / Date / locale-sensitive output.
---

# react-patterns — React 19, Next.js 16 App Router, shadcn/ui, TanStack

## Stack di riferimento

- **React 19.2** (`react`, `react-dom`) — Actions, `useTransition`,
  `useOptimistic`, `use()`, `useFormStatus`, ref as prop (no `forwardRef`)
- **Next.js 16** App Router — async `params`/`searchParams`/`cookies()`/`headers()`,
  Server Actions, Route Handlers, PPR opt-in per route
- **shadcn/ui** copy-paste in `src/components/ui/` con Radix sotto, `cva` + `cn`
  (`src/lib/utils.ts`)
- **TanStack Query/Table** istanziati in `src/components/providers.tsx`
- **Tailwind 4** + `prettier-plugin-tailwindcss` (formatta classi)
- **react-hook-form** + Zod per form, **next-themes** per dark mode

---

## Server vs Client Components: regola di default

**Default = Server Component.** Marca `"use client"` SOLO quando hai bisogno di:

- hook React di stato/effetto (`useState`, `useEffect`, `useReducer`, `useRef` su DOM)
- event handler nel JSX (`onClick`, `onChange`, …)
- API browser (`window`, `document`, `localStorage`, `IntersectionObserver`)
- librerie che a loro volta hanno `"use client"` (es. TanStack Query hooks,
  `react-hook-form`, Radix interactive primitives, framer-motion)

Per il resto: **server**. Fetch dati nel Server Component (parallelo con
`Promise.all`), passa **dati serializzati** al Client Component come prop.
Mai trascinare un sottoalbero in client solo per usare una `<Image>` o un `<a>`.

**Boundary minimale.** Se in una pagina serve interattività solo in un punto,
estrai quel pezzo in un file `*.client.tsx` (o componente in
`src/components/<feature>/<name>.tsx` con `"use client"` in testa) e lascia
server il resto. La pagina rimane SSR/streaming-friendly.

### `appHref()` è server-only in pratica

Da Client Component `NEXT_PUBLIC_APP_URL` non è nel bundle (non baked dal
Dockerfile) e `APP_HOSTNAME` non è `NEXT_PUBLIC_*` — cadrebbe sul default
hardcoded di produzione rompendo sandbox/self-hosted. Calcola l'href nel
**parent Server Component** e passalo come prop al Client Component
(vedi `pricing-section.tsx` e regola 15 in `CLAUDE.md`).

### Link auth da marketing → app: plain `<a>`

Dal gruppo `(marketing)/*` (e da `src/components/marketing/`, `help/`) i link
a `/login`, `/register`, `/reset-password` devono usare `appHref()` + **plain
`<a>`**, mai `<Link>` di Next. Il soft routing terrebbe l'utente su origin
marketing e Turnstile rompe con `captcha_hostname_mismatch`.

---

## Next.js 16: API async

In Next 16 sono **Promise**, vanno `await`-ati o passati a `use()`:

```tsx
// app/scontrini/[id]/page.tsx
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  // ...
}
```

Lo stesso vale per `cookies()` e `headers()`:

```ts
import { cookies, headers } from "next/headers";

const cookieStore = await cookies();
const h = await headers();
```

Validare sempre `id` con `isValidUuid()` prima di passarlo al service
(regola 9 di `CLAUDE.md`).

---

## Composizione con shadcn/ui + Radix

I file in `src/components/ui/` sono **codice del repo**, non dipendenze:
modificarli direttamente se serve (no fork esterno). Variant tipiche:

```tsx
const buttonVariants = cva("inline-flex items-center …", {
  variants: {
    variant: { default: "…", destructive: "…", ghost: "…" },
    size: { sm: "h-8 px-3", md: "h-9 px-4", lg: "h-10 px-6" },
  },
  defaultVariants: { variant: "default", size: "md" },
});
```

Componi sempre con `cn(buttonVariants({ variant }), className)` per permettere
override dall'esterno (Tailwind 4 + `tailwind-merge` deduplica le classi in
conflitto).

### Radix `asChild` per polymorphic API

Preferire `asChild` (Slot) invece di duplicare un componente per renderizzarlo
come `<a>`/`<Link>`/`<button>`:

```tsx
<Button asChild>
  <Link href="/cassa">Apri cassa</Link>
</Button>
```

### Readonly props (S6861)

Le props dei componenti React devono essere `Readonly<…>` o avere proprietà
`readonly`. La codebase ha già esempi — se aggiungi un componente, copia il
pattern (vedi `sonar-quality-gate`).

```tsx
function ReceiptRow({ receipt, onVoid }: Readonly<{ receipt: Receipt; onVoid: () => void }>) { … }
```

### JSX spacing (S6772)

Niente spazi ambigui dentro `{ }`: `{foo}` non `{ foo }`. Prettier lo fa per
te se i file passano per `npx prettier --write`.

---

## TanStack Query — provider unico

Il `QueryClient` è istanziato in `src/components/providers.tsx` (Client
Component, montato dal root layout). **Non** istanziarne uno nuovo nei
componenti — perderesti la cache condivisa e i devtools.

Pattern per fetch lato client:

```tsx
"use client";
const { data, isPending } = useQuery({
  queryKey: ["receipts", businessId, filters],
  queryFn: () => fetchReceipts(businessId, filters),
  staleTime: 30_000,
});
```

Per dati fetched server-side e reidratati client-side, passa il payload
iniziale come `initialData` dal Server Component parent.

### Optimistic update + invalidate

Per mutation con UI immediata (regola "performance percepita = priorità #1"):

```tsx
const qc = useQueryClient();
const mutation = useMutation({
  mutationFn: emitReceipt,
  onMutate: async (input) => {
    await qc.cancelQueries({ queryKey: ["receipts"] });
    const prev = qc.getQueryData(["receipts"]);
    qc.setQueryData(["receipts"], (old) => [
      optimisticRow(input),
      ...(old ?? []),
    ]);
    return { prev };
  },
  onError: (_e, _v, ctx) => qc.setQueryData(["receipts"], ctx?.prev),
  onSettled: () => qc.invalidateQueries({ queryKey: ["receipts"] }),
});
```

Per la chiamata AdE (2-5s): partire ottimisticamente con stato `PENDING`,
mostrare skeleton + toast, poi sostituire con stato reale al `onSettled`.

---

## React 19: Actions, useTransition, useOptimistic

### Server Action chiamata da `<form action={…}>`

```tsx
// server-action.ts ("use server")
export async function voidReceipt(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || !isValidUuid(id)) return { ok: false };
  // ... wrap SDK esterni in try-catch (regola 10)
}

// client component
const [isPending, startTransition] = useTransition();
<form action={(fd) => startTransition(() => voidReceipt(fd))}>…</form>;
```

`useFormStatus()` dentro al form per stato del submit senza prop drilling.

### `useOptimistic` per liste

```tsx
const [optimistic, addOptimistic] = useOptimistic(
  receipts,
  (state, draft: Receipt) => [draft, ...state],
);
```

Usato in combinazione con Server Action per UX istantanea senza TanStack
Query (es. form di catalogo prodotti).

### Ref as prop (no `forwardRef`)

React 19: `ref` è una prop normale. Non scrivere più `forwardRef` in nuovo
codice.

```tsx
function Input({
  ref,
  ...props
}: Readonly<{ ref?: React.Ref<HTMLInputElement> } & InputProps>) {
  return <input ref={ref} {...props} />;
}
```

---

## Form: react-hook-form + Zod

Schema Zod **condiviso** tra Client (validazione live) e Server Action
(validazione di sicurezza). Mai fidarsi del solo client.

```tsx
const schema = z.object({ email: z.string().email(), … });
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
```

Sul server, normalizzare email con `normalizeEmail()` (regola 9) **prima** di
passare al service.

---

## Hydration mismatch — cause comuni

Errore "Hydration failed because the server rendered HTML didn't match…":

1. **`Date.now()` / `new Date()` / `Math.random()` nel render** → render in
   un `useEffect` o passa il valore dal server come prop.
2. **`toLocaleString()` senza locale esplicito** → forza
   `toLocaleString("it-IT", { … })`, server e client devono usare la stessa.
3. **`window`/`navigator` nel render di un Server Component** → spostare in
   Client Component + `useEffect`.
4. **`next-themes`** → il root `<html>` ha `suppressHydrationWarning` nel
   layout, e il `ThemeProvider` deve avvolgere SOLO i figli del `<body>`.
5. **HTML invalido annidato** (`<p>` dentro `<p>`, `<a>` dentro `<a>`,
   `<div>` dentro `<button>`) — React 19 logga warning più rumorosi.

---

## Web Storage: sempre via `safe-storage`

Su browser con storage bloccato (modalità privacy, cookie di terze parti
disabilitati, alcune webview mobile) **leggere la property stessa**
`window.sessionStorage` / `window.localStorage` lancia `SecurityError`
(DOMException 18) — **non** basta il try/catch sul singolo `getItem`/`setItem`,
va protetto l'accesso allo store. Un throw dentro un `useEffect` o un lazy
initializer di `useState` finisce in Sentry e può rompere il commit
dell'effetto (visto in prod su `/login` da Chrome Mobile, Sentry
SCONTRINOZERO-H).

Mai toccare `sessionStorage`/`localStorage` diretti nei componenti: usa
`safeSessionStorage` / `safeLocalStorage` da `@/lib/safe-storage` (degradano a
`null` in lettura / no-op in scrittura, e sono SSR-safe). Per testare la
degradazione si fa lo spy sul **getter** della property:

```ts
vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
  throw new DOMException("Access is denied", "SecurityError");
});
```

---

## Tailwind 4 — class ordering

Le classi vanno ordinate da `prettier-plugin-tailwindcss`. Dopo modifiche
estese alle classi:

```bash
npx prettier --write src/<file>
```

Altrimenti `npx prettier --check src/` fallisce in CI (vedi sezione "Pre-PR"
di `CLAUDE.md`).

`cn()` (`src/lib/utils.ts`) usa `tailwind-merge`: in caso di conflitto vince
l'ultima classe. Utile per override:

```tsx
<Button className={cn("bg-primary", isDanger && "bg-destructive")} />
```

---

## PWA / Serwist — attenzione al `defaultCache`

Il service worker (`src/sw.ts`) usa `runtimeCaching: defaultCache` di
`@serwist/next/worker`. **Non è asset-only:** `defaultCache` include strategie
di runtime caching anche per same-origin GET, tra cui una `NetworkFirst` per
le richieste `/api/*`. Conseguenze:

- **Server Action (POST)** → non cachate, sempre rete.
- **Route Handler GET sotto `/api/*`** → potenzialmente serviti dalla cache
  su timeout/offline. ⚠️ `Cache-Control: no-store` sulla response **non
  basta**: in Serwist 9.x la `NetworkFirst` scrive in cache via
  `fetchAndCachePut`, e il `cacheOkAndOpaquePlugin` aggiunto di default
  decide solo in base allo status (200/opaque) ignorando l'header
  `Cache-Control`. Per dati tenant-specifici / sensibili / che cambiano
  spesso bisogna **override esplicito** in `src/sw.ts`: una regola
  `NetworkOnly` (o un matcher che esclude il pattern) registrata **prima**
  di `defaultCache`, oppure una `NetworkFirst` con plugin custom che rifiuta
  via `cacheWillUpdate` le response non cacheable. `Vary: Cookie/Authorization`
  da solo non previene la scrittura in cache, al massimo isola la voce per
  variante.
- **Pagine / RSC payload** → cachate con strategia network-first analoga;
  per route autenticate fare affidamento su `cookies()`/redirect server-side,
  non su "il SW non interferisce".

`src/components/pwa/` contiene gli hook lato client per install prompt e
update detection — sono Client Components che usano `window.matchMedia` e
listener `beforeinstallprompt`. Da non importare in Server Component.

### `beforeinstallprompt` — race del listener tardivo (Android)

Chrome su Android emette `beforeinstallprompt` **molto presto** dopo il load
(appena manifest + SW sono pronti) e **non lo ri-emette**. Se il listener è
agganciato in una `useEffect` di un componente annidato — es. il banner
montato in fondo al `dashboard/layout.tsx`, che è un Server Component `async`
con `await` bloccanti prima del render — l'evento può scattare prima che React
idrati e l'evento è perso → su Android il pulsante "Installa" non compare mai,
mentre iOS (istruzioni statiche, niente evento) sembra funzionare. Asimmetria
sintomatica.

**Fix (commit PWA Android):** cattura l'evento in uno store singleton client
(`src/lib/pwa/install-prompt-store.ts`) il cui `initInstallPromptCapture()` è
chiamato a module-load da `Providers` (entry client condiviso del root layout,
ben prima del mount del banner). Idempotente + SSR-safe. La UI legge via
`useSyncExternalStore(subscribe, getDeferredPrompt, () => null)`, così vede
anche un evento già bufferizzato. `getSnapshot` deve restituire un riferimento
stabile (il module var), altrimenti loop di render. Reset del singleton tra
test con `resetInstallPromptStoreForTests()`.

### Asset PWA esclusi dal `proxy.ts` matcher

`/sw.js` e `/manifest.webmanifest` **devono** stare nel negative-lookahead del
`config.matcher` (come `_next/static`, favicon, ecc.): un service worker che
riceve un 3xx fallisce la registrazione, e far girare `supabase.auth.getUser()`
su ogni fetch di questi file è spreco puro. Estensioni `.js`/`.webmanifest`
non sono coperte dalla lista asset statici (`svg|png|...`), quindi vanno
aggiunte esplicitamente (`sw\.js|manifest\.webmanifest`). Test: costruire
`new RegExp(\`^${config.matcher[0]}$\`)` e asserire che NON matcha gli asset PWA
ma sì le route app.

---

## TDD per componenti

Ogni componente con logica ha il suo `*.test.tsx` (regola 2). Stack:
Vitest + `@testing-library/react`. Pattern e gotcha (mock di classi,
`mock*` prefix nelle factory, `expect()` obbligatori) in `testing-patterns`.

Per Server Component asincroni: testare la funzione di fetch separata e il
componente come pure render con dati mock. Non renderizzare un async server
component direttamente in jsdom.

---

## Vercel official React Skills

https://raw.githubusercontent.com/vercel-labs/agent-skills/refs/heads/main/skills/react-best-practices/SKILL.md
https://raw.githubusercontent.com/vercel-labs/agent-skills/refs/heads/main/skills/web-design-guidelines/SKILL.md
https://raw.githubusercontent.com/vercel-labs/agent-skills/refs/heads/main/skills/react-view-transitions/SKILL.md
https://raw.githubusercontent.com/vercel-labs/agent-skills/refs/heads/main/skills/composition-patterns/SKILL.md
