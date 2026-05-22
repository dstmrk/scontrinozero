# claude-sonar.md — Regole SonarCloud specifiche

Quality gate ricorrente e regole che si attivano spesso. Riferimento dal
`CLAUDE.md` core.

---

## Quality gate (must not regress)

- **Coverage on new code:** ≥ 80%
- **Duplicated lines on new code:** < 3%
- **0 new issues:** fix every SonarCloud issue before merging, anche quando il
  Quality Gate passa. Issues lasciati aperti accumulano debt e bloccheranno
  future PR.

---

## Quick fixes ricorrenti

- **Cognitive Complexity > 15** → estrarre helper functions
- **Optional chain suggestions** → `!x || x.prop` → `x?.prop`
- **`typeof x === "undefined"`** → `x === undefined`
- **`window.*`** → `globalThis.window.*` (es2020 portability)
- **`<div role="banner">`** → `<header>` (semantic element)
- **Async functions as `onClick`** → `onClick={() => void asyncFn()}`

---

## Coverage exclusions

Se un file ha **no testable logic** (pure config, UI shell):

- Aggiungere a `sonar.coverage.exclusions` in `sonar-project.properties`
- E al `exclude` in `vitest.config.ts`
- Mai lasciare untested senza esclusione esplicita

**Service worker files (`src/sw.ts`)** devono essere in `sonar.exclusions`
(non solo coverage exclusions). Usano WebWorker-specific globals
(`ServiceWorkerGlobalScope`, `declare const self`) che confliggono con la DOM
lib e triggerano falsi positivi (variable shadowing). Aggiungere anche a
`tsconfig.json` exclude per lo stesso motivo.

---

## Regole specifiche da anticipare

### S6861 — React props not readonly

Ogni `interface` di props di componente React deve avere tutti i campi marcati
`readonly`. Applicare sistematicamente a ogni nuovo componente.

```typescript
interface MyProps {
  readonly foo: string;
  readonly bar: number;
}
```

### S6772 — Ambiguous spacing in JSX

Si attiva in due casi:

1. `{" "}` tra elementi JSX — fix: incorpora lo spazio nel testo adiacente
   come `{"testo "}` o `{" testo"}`.
2. Testo nudo su riga separata adiacente a qualsiasi elemento inline di
   chiusura o apertura (`</strong>`, `</a>`, `</Link>`, `<strong>`, ecc.) —
   fix: converti il testo in espressione JSX `{"testo"}`.

Si manifesta sia con testo DOPO un tag di chiusura che con testo PRIMA di un
tag di apertura su righe separate. Prettier può re-introdurre `{" "}`
riformattando: scrivi JSX in modo da non richiederlo.

### S7780 — Escape sequences in template literals

Usa `` String.raw`...` `` invece di template literal con `\\` quando il contenuto
mostra backslash letterali (es. curl examples). Con `String.raw`, scrivi `\`
singolo invece di `\\` e i newline del sorgente sono preservati.

### S5852 (ReDoS) — Security Hotspot

`// NOSONAR` **NON** sopprime Security Hotspots — solo Issues (Bug/CodeSmell/
Vulnerability). Hotspots richiedono fix del codice (rule non fires più) o
review umana via SonarCloud UI ("Mark as Safe").

Per S5852: sostituire regex con Set-based char loop + manual pointer trimming.

### S5122 (CORS `*`) — Security Hotspot

`// NOSONAR` inefficace. L'utente deve acknowledge nella SonarCloud UI o
rimuovere il wildcard.

---

## Gitleaks e pagine di documentazione

Placeholder di chiavi API negli esempi curl (es. `szk_live_XXXX`,
`Authorization: Bearer ...`) triggerano le rules `curl-auth-header` e
`generic-api-key`. Sono falsi positivi — aggiungere i fingerprint al
`.gitleaksignore`.

⚠️ **I fingerprint sono commit-specifici** (`COMMIT_SHA:FILE:RULE:LINE`). Ogni
commit che modifica le righe coinvolte genera nuovi fingerprint. Aggiungere i
fingerprint di tutti i commit in un'unica passata quando possibile, ispezionando
le righe esatte con `grep -n`.

---

## Debug di CI failure opachi

Quando un CI fail (SonarCloud, Gitleaks, ecc.) **non è visibile** nel diff PR o
nei log, **STOP e chiedere all'utente** l'info specifica (es. "quale file/righe
SonarCloud flagga come duplicate?") invece di tentare blind fix. Tentativi a
casaccio sprecano CI cycles e oscurano la root cause. Una domanda mirata =
risposta in secondi; trial-and-error random = ore.
