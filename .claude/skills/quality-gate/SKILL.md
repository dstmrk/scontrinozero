---
name: quality-gate
description: Use when a local quality gate fails or before writing code that could trip one — `npm run test:coverage` failing with "does not meet per-file threshold (80%)" or an aggregate coverage threshold, deciding whether a file belongs in the coverage `exclude` of vitest.config.ts, `npm run lint` failing on an `sonarjs/*` rule (cognitive-complexity > 15, no-nested-conditional, slow-regex, cors, no-skipped-tests, prefer-specific-assertions…) configured in eslint.config.mjs, or Gitleaks findings — curl-auth-header / generic-api-key false positives on API-key placeholders in docs (closed by a secret-shape allowlist in .gitleaks.toml, NOT by .gitleaksignore fingerprints, which die at every squash merge). Also covers why Swift is deliberately left out of the CodeQL default setup (Capacitor SPM paths into mobile/node_modules break autobuild) and when to reopen it, why SonarCloud was removed (2026-11) and the rule "ask the user when CI failure is opaque" instead of blind-fixing.
---

# quality-gate — i gate di qualità, tutti locali

Dal 2026-11 non c'è più SonarCloud: i due controlli che dava girano in
locale e in CI, senza servizi esterni, e bocciano da soli.

| Gate             | Dove vive                                         | Chi lo fa girare                                  |
| ---------------- | ------------------------------------------------- | ------------------------------------------------- |
| Coverage         | `coverage.thresholds` in `vitest.config.ts`       | `npm run test:coverage`, job `test`               |
| Regole SonarJS   | `eslint-plugin-sonarjs` in `eslint.config.mjs`    | `npm run lint`, lint-staged al commit, job `lint` |
| Segreti          | `.gitleaks.toml`                                  | job `secret-scan`                                 |
| Security (taint) | CodeQL default setup, dalle impostazioni del repo | check `CodeQL`                                    |

---

## Coverage

- **Per file:** ogni sorgente di `src/` copre almeno l'80% delle righe.
  Errore tipico: `Coverage for lines (62%) does not meet per-file threshold
(80%) for src/lib/x.ts`. La risposta giusta quasi sempre è il test che
  manca, non l'esclusione.
- **Aggregato:** una rete a 95/95/92/95 (righe, statement, branch, funzioni),
  circa 2 punti sotto i valori di novembre 2026. Ferma l'erosione lenta, non
  una PR coperta all'80%.
- **Perimetro:** `scripts/` conta nell'aggregato ma non nel per-file, come
  restava fuori dallo scan di Sonar.

Differenza da ricordare rispetto a Sonar: il gate è per **file**, non per
**righe nuove**. Un file nuovo senza test non passa; una modifica scoperta
dentro un file grande che resta sopra l'80% invece passa. TDD (regola 2) resta
l'unica garanzia su quel caso.

### Esclusioni

Un file senza logica testabile (config pura, guscio UI, wrapper `next/og`, un
wrapper Recharts i cui formatter jsdom non raggiunge) va nell'`exclude` di
coverage in `vitest.config.ts`, con il motivo in riga. È l'unica lista:
prima andava ricopiata nella config di Sonar.

`src/app/**/page.tsx` è escluso in blocco. Se una pagina ha logica (letture,
rami di stato), quella logica va in un file accanto con la sua suite e
`page.tsx` resta un guscio: è ciò che fa `src/app/(auth)/invito/[token]/`
(`invite-view.ts`, `invite-unavailable.tsx`).

---

## Regole SonarJS

Raccomandate di `eslint-plugin-sonarjs` su `src/`, senza le 18 `aws-*`; sui
`*.test.*` solo quelle pensate per i test (asserzioni, titoli duplicati, test
saltati). Le più frequenti:

- **`sonarjs/cognitive-complexity` > 15** → estrai helper con nome. I commenti
  "estratto per la Cognitive Complexity (S3776)" sparsi nel codice parlano di
  questa regola.
- **`sonarjs/no-nested-conditional`** (S3358) → early return o variabile
  intermedia al posto del ternario annidato.
- **`sonarjs/slow-regex`** (S5852, ReDoS) → loop su `Set` di caratteri e
  trimming a puntatori al posto della regex.
- **`sonarjs/cors`** (S5122) → un wildcard voluto va motivato con un
  `eslint-disable-next-line sonarjs/cors -- <motivo>`.

Un falso positivo si chiude sempre con `eslint-disable-next-line <regola> --
<motivo>` sulla riga, mai spegnendo la regola nel config.

**Non hanno un gate**, perché il plugin non le include: S6861 (props
`readonly`), S6772 (spaziatura JSX ambigua), S7780 (`String.raw`), S7503
(`async` senza `await`), S9382 (`await` in un loop), S8985 (side effect dentro
`waitFor`). `require-await` e `no-await-in-loop` di ESLint sono stati
valutati e scartati: 14 e 35 segnalazioni sul codice di produzione, quasi
tutte su retry e polling sequenziali per design. Di queste, l'unica con un
bug dietro è S8985, documentata nella skill `testing-patterns`.

---

## Gitleaks: allowlist per forma, fingerprint solo come ultima spiaggia

**UUID di esempio nei doc API.** Anche un `"idempotencyKey": "<uuid>"` scatta
`generic-api-key` se la UUID ha entropia alta (`7c9e6679-7425-…`,
`d4e5f6a7-b8c9-…`, PR #1017). Negli esempi usa UUID a bassa entropia come
quelle già presenti (`550e8400-e29b-41d4-a716-44665544000N`). Verifica in
locale con lo stesso binario della CI (gitleaks 8.24.3, release GitHub):
`gitleaks git --log-opts="origin/main..HEAD" --config .gitleaks.toml`. La
CI scansiona **ogni commit** della PR: correggere in un commit successivo non
basta, il commit con la UUID va riscritto (sul tuo branch: squash e
`--force-with-lease`, tanto il merge è in squash).

I placeholder di chiavi API negli esempi curl (`szk_live_XXXX`,
`Authorization: Bearer …`) triggerano `curl-auth-header` e `generic-api-key`.
Sono falsi positivi, ma **non si chiudono con un fingerprint**.

⚠️ **Un fingerprint è `<sha>:<file>:<regola>:<riga>`, quindi è legato al
commit.** Il repo mergia in **squash**: il commit che la PR ha scansionato non
è quello che finisce in `main`, e la fingerprint aggiunta durante la PR nasce
già morta. Il falso positivo torna al primo scan che riporta quella riga in un
range di scansione. Lo stesso placeholder si era accumulato sotto **sette sha diversi** in
`.gitleaksignore`: ogni riga era la cicatrice di un giro.

**La forma corretta è un allowlist in `.gitleaks.toml`**, che non dipende da
nessuno sha:

```toml
[extend]
useDefault = true   # senza questo il file SOSTITUISCE le regole: scan no-op

[allowlist]
regexes = ['''^szk_(live|mgmt)_X+$''']
```

Si allowlista la **forma del segreto**, mai il path. Una regex che descrive un
placeholder impossibile (prefisso + sole X, contro 48 caratteri casuali di una
chiave vera) non spegne niente: una chiave vera nello stesso identico file
continua a far fallire lo scan. Un allowlist per path spegne invece _ogni_
regola su quei file.

**Vincoli misurati su gitleaks 8.24.3** (la versione che `gitleaks-action` v3
scarica di default — vive in `dist/index.js` della action, non nel nostro
`ci.yml`):

- solo `[allowlist]` **singolare** e globale viene letto. `[[allowlists]]`
  plurale e `targetRules` sono ignorati **in silenzio**: il config si carica,
  l'allowlist non esiste;
- `matchCondition = "AND"` è anch'esso ignorato: `paths` e `regexes` restano
  in **OR**, quindi non si può restringere una regex a un path;
- `paths` è matchato sul path **assoluto**: `^DEVELOPER\.md$` non matcha mai,
  serve `DEVELOPER\.md$`;
- il config viene scoperto da solo (`.gitleaks.toml` nella root dello scan):
  la action non passa `--config` e non legge `GITLEAKS_CONFIG`;
- `.gitleaksignore` accetta righe di commento con `#`.

Il fingerprint resta legittimo solo dove una regex non separa il falso positivo
dal vero — fixture di test, chiavi pubbliche di script — ed è lì che va
scritto perché non esiste alternativa, non per pigrizia.

**Verifica in locale prima di pushare**, che è l'unico modo di sapere se un
allowlist funziona davvero su questa versione:

```bash
curl -sSL -o gl.tar.gz \
  https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz
tar xzf gl.tar.gz gitleaks
./gitleaks detect --no-git --source . --redact --exit-code 0 --report-format json --report-path /tmp/gl.json
```

Due asserzioni, non una: il falso positivo sparisce **e** un segreto dalla
forma reale, incollato nello stesso file, viene ancora trovato. La seconda è
quella che distingue un allowlist da una regola spenta.

---

## CodeQL: Swift escluso dal default setup

Il default setup scansiona `actions`, `java-kotlin` e
`javascript-typescript`. Swift è rilevato (`mobile/ios/`) ma **non è
spuntato, ed è voluto**: non va riattivato come se fosse una svista.

- **Perché fallisce.** Il `Package.swift` di
  `mobile/ios/App/CapApp-SPM`, generato da Capacitor, punta ai plugin
  con path locali verso `mobile/node_modules/`. L'autobuild non esegue
  `npm install` in `mobile/`, quindi `xcodebuild` (e poi il fallback
  `swift build`) si ferma su «the package at
  '.../node_modules/@capacitor-community/bluetooth-le' cannot be
  accessed». Dopo il primo run fallito (2026-11-17) GitHub ha tolto
  Swift dalla configurazione da solo, con il job «Adjust
  Configuration» in coda al run.
- **Perché va bene così.** Lo Swift del repo è template Capacitor
  (`AppDelegate.swift`, `SceneDelegate.swift`, circa 70 righe): non c'è
  taint da analizzare, e il build costava ~13 minuti di runner macOS a
  ogni push.
- **Il banner residuo** («Code Scanning has never received a successful
  scan for this configuration», categoria `/language:swift`) è lo stato
  di quella configurazione orfana, non degli altri linguaggi.
- **Quando riaprire.** Se in `mobile/ios/App` entra Swift scritto da noi
  (un plugin nativo nostro, logica nell'`AppDelegate`): advanced setup
  con un `.github/workflows/codeql.yml` che fa `npm ci` in `mobile/`
  prima di un build manuale `xcodebuild`, al posto dell'autobuild.

---

## Debug di CI failure opachi

Quando un CI fail (Gitleaks, CodeQL, ecc.) **non è visibile** nel diff PR o
nei log, **STOP e chiedere all'utente** l'info specifica (es. "quale riga segnala
CodeQL?") invece di tentare blind fix. Tentativi a
casaccio sprecano CI cycles e oscurano la root cause. Una domanda mirata =
risposta in secondi; trial-and-error random = ore.
