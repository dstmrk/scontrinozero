---
name: sonar-quality-gate
description: Use when fixing SonarCloud or Gitleaks findings — Cognitive Complexity > 15, S6861 readonly React props, S6772 ambiguous JSX spacing, S7780 escape sequences in template literals (use String.raw), S5852 ReDoS or S5122 CORS wildcard Security Hotspots (NOSONAR does not suppress hotspots), or curl-auth-header / generic-api-key false positives in docs requiring .gitleaksignore fingerprints. Also covers coverage exclusions in sonar-project.properties + vitest.config.ts, service worker exclusions, and the rule "ask the user when CI failure is opaque" instead of blind-fixing.
---

# sonar-quality-gate — Regole SonarCloud specifiche

Quality gate ricorrente e regole che si attivano spesso.

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

## Scan Sonar in CI: wrapper, non l'action

Il job `sonar` di `ci.yml` **non** usa più `SonarSource/sonarqube-scan-action`
direttamente: gira `scripts/ci/sonar-scan.sh`. Motivo: l'action non ha retry e
riscarica il CLI da `binaries.sonarsource.com` a ogni run; quel CDN risponde a
volte **HTTP 403** in modo intermittente (flakiness lato Sonar, nessun problema
nel nostro codice) e faceva fallire il job — fastidioso su `main` post-merge
(notifiche). Il wrapper:

1. scarica il CLI con **retry + backoff** (il 403 sparisce quasi sempre al 2°
   tentativo);
2. se il **download** fallisce su tutti i tentativi → `::warning::` + `exit 0`
   (job verde, niente notifica). Tollera **solo** la fase di download;
3. se lo **scan** fallisce (config/auth/analisi reale) → exit non-zero, job
   rosso. I problemi veri restano visibili.

PR/branch decoration: auto-rilevati dallo scanner dall'ambiente GitHub Actions
(no `sonar.pullrequest.*`). Il `-linux-x64.zip` include la JRE. Versione CLI
pinnata in `SCANNER_VERSION` (bump = una riga). Logica coperta da
`scripts/ci/test-sonar-scan.sh` (gira nel job `sonar-script-tests` quando cambia
`scripts/ci/**` o `ci.yml`). Trade-off noto: niente verifica OpenPGP del binario
(solo TLS dall'host ufficiale).

⚠️ Se devi tornare all'action o cambiare il comportamento di tolleranza, ricorda
che questo job **non** enforce il quality gate (è un check separato della
SonarCloud GitHub App): il suo unico failure mode ripetibile è il download.

## Debug di CI failure opachi

Quando un CI fail (SonarCloud, Gitleaks, ecc.) **non è visibile** nel diff PR o
nei log, **STOP e chiedere all'utente** l'info specifica (es. "quale file/righe
SonarCloud flagga come duplicate?") invece di tentare blind fix. Tentativi a
casaccio sprecano CI cycles e oscurano la root cause. Una domanda mirata =
risposta in secondi; trial-and-error random = ore.
