---
name: test-audit
description: Use when deciding whether a test earns its place — before adding or changing a test (authoring gate - which observable contract, which credible regression, why existing proof misses it), when reviewing a PR that adds tests, when a test breaks on a behavior-preserving refactor, when pruning or consolidating a suite, or when auditing the test surface of a module or of the whole repo (the parallel `tests/unit/` layer that duplicates colocated `src/**/X.test.ts` suites, copied inventories like `toHaveLength(92)` on the sitemap, tests that configure the library themselves instead of using the production config, weak negatives `expect(result.error).toBeDefined()`, test-only production seams such as an exported reset of a module singleton). Covers the retention bar (AdE protocol, money, migrations, RLS, security, public `/api/v1`, `*.contract.test.ts` source inspection), the R/F/C/D ledger, the mutation check, and how deletions interact with the per-file 80% coverage gate. NOT about Vitest mechanics (mocks, fake timers, waitFor) — that is testing-patterns.
---

# test-audit — un test deve proteggere un contratto, non una riga

Adattata da `openclaw/openclaw` `.agents/skills/test-audit` (novembre 2026).
`testing-patterns` dice **come** scrivere un test che non mente; questa skill
dice **se** quel test deve esistere. Le due si leggono insieme.

Il repo ha più righe di test (~98k) che di produzione (~84k). Non è un
problema in sé — AdE, importi e sicurezza meritano prove fitte — ma ogni
test è codice che qualcuno aggiorna a ogni refactor. Un test che non può
fallire per un bug reale costa come uno buono e non protegge niente.

## Gate di scrittura (ogni test nuovo o modificato)

Prima di scrivere il test, rispondi alle quattro domande. Se una risposta
manca, il test non entra.

1. **Quale contratto osservabile protegge?** Comportamento, invariante, o
   contratto indipendente (protocollo AdE, payload `/api/v1`, schema DB).
   "Copre le righe 40-55" non è un contratto.
2. **Quale regressione credibile lo fa fallire?** Nominala. Se non riesci a
   immaginare la modifica di produzione che lo manda in rosso, il test è
   decorativo.
3. **Perché la prova esistente non basta?** Ogni contratto ha **un owner
   primario**, al confine più forte che lo raggiunge. Qui l'owner è la suite
   colocata `src/**/X.test.ts` del modulo che possiede il comportamento. Un
   secondo livello si giustifica solo con un rischio di trasporto o ciclo di
   vita distinto (es. la route `/api/v1` sopra il service: auth Bearer,
   status HTTP, envelope d'errore). Se il caso è una variante, estendi la
   tabella o il fixture esistente invece di aprire un `it` nuovo.
   Un modulo può avere più suite colocate (`X.test.ts`, `X.<parte>.test.ts`)
   quando le parti richiedono mock incompatibili: è il caso della lista v1
   (`route.list.test.ts`, catena di query su `getDb`, contro la transazione
   mockata di `route.test.ts`) e del reset password
   (`auth-actions.reset-confirm.test.ts`). Il vincolo resta uno: ogni
   contratto in una suite sola, e un commento in testa che dica dove sta il
   resto.
4. **Serve un export, un flag o un parametro che esiste solo per il test?**
   Allora sposta la prova al confine reale. Per un singleton di modulo il
   cui stato sta **tutto** in variabili del modulo (`_stripe`, `_resend`,
   un timestamp di throttle), `vi.resetModules()` + `await import()` (già
   lo standard nel repo) rende superfluo un `resetXForTests()` esportato.
   Non vale quando il reset stacca qualcosa da un oggetto che sopravvive al
   reload: `resetInstallPromptStoreForTests` toglie il listener
   `beforeinstallprompt` da `window`, `resetPrinterStoreForTests` svuota i
   subscriber agganciati ai componenti. jsdom tiene lo stesso `window` per
   tutto il file, quindi ogni reload aggiungerebbe un listener senza
   togliere il vecchio. Lì il reset esportato è un contratto, non un seam.

Due corollari:

- Un bug si copre con **una** regressione al suo owner: deve fallire prima
  del fix per il motivo giusto e passare dopo. Non si replica a ogni livello
  attraversato.
- Un refactor che preserva il comportamento non deve rompere test. Se ne
  rompe, quei test asserivano l'implementazione: correggili invece di
  aggiornare le aspettative.

### Coverage non è un contratto

La regola 2 vuole un test file per ogni file con logica, e il gate
`quality-gate` vuole l'80% delle righe per file. Sono vincoli veri, ma
generano una tentazione precisa: il test scritto per toccare righe, che
chiama la funzione e asserisce lo shape della chiamata al mock. Quel test
passa il gate e non protegge niente. La soluzione è un'asserzione sull'esito
osservabile del ramo, non una riga di coverage in più.

Al contrario, se cancellare un test fa scendere un file sotto l'80%, le
righe scoperte sono una di due cose: un contratto che la prova rimasta non
vede (ripristina una prova al confine giusto) o codice morto (cancellalo,
regola 28). Mai aggiungere il file all'`exclude` di `vitest.config.ts` per
far passare una cancellazione.

## Pattern da rifiutare (nuovi) e da auditare (esistenti)

Ognuno con un esempio trovato nel repo, perché si riconosce meglio così.

- **La libreria configurata dal test.** Il test costruisce `pino({ redact:
{ paths: [...] } })` con una lista copiata a mano e verifica che pino
  rediga. Prova pino, non `REDACT_PATHS`: togli `"password"` dalla
  produzione e resta verde. La prova giusta importa la config reale.
- **Inventari copiati.** `expect(result).toHaveLength(92)` sulla sitemap,
  "contiene esattamente 12 domande", la lista letterale degli slug. Rompono
  a ogni contenuto aggiunto e non catturano nessun bug: il contratto vero è
  l'invariante (slug unici, nessuna collisione `/help` vs `/guide`, ogni
  pagina pubblica nella sitemap).
- **Negativi deboli.** `expect(result.error).toBeDefined()` passa anche se
  il rifiuto arriva da un guard diverso da quello che il nome promette
  (input vuoto bocciato dall'auth). Asserisci il messaggio o il codice del
  guard specifico, più l'effetto mancato (`mockInsert` non chiamato).
- **Il mock che fornisce il valore asserito.** `mockFetchAdePrerequisites`
  ritorna `"Credenziali AdE non trovate"` e il test asserisce che l'errore
  contiene `"Credenziali"`. La parte che conta è che l'action si fermi prima
  dell'insert; due test identici per due messaggi diversi sono uno solo.
- **Nomi che promettono ciò che il test non esercita.** "is wrapped in React
  cache()" con `cache` mockato come passthrough e
  `expect(typeof fn).toBe("function")`. Giudica il test dalle asserzioni,
  non dal nome.
- **Shape-check che il type-check già fa.** `typeof logger.info ===
"function"`: `npm run type-check` fallisce prima.
- **Duplicati tra livelli.** Lo stesso contratto in `src/lib/uuid.test.ts`
  e `tests/unit/lib-uuid.test.ts`. Ogni modifica al modulo paga due suite,
  ognuna con i suoi mock (`testing-patterns`, sezione rate limit: "mockare
  il limiter in tutti").
- **Seam solo per i test.** Export di produzione senza chiamanti di
  produzione, che azzerano solo variabili del modulo. Così erano
  `_resetStripeForTest` e `_resetResendForTest`, tolti a novembre 2026
  in favore del reload del modulo (vedi il punto 4 del gate per
  l'eccezione).
- **Fixture che fabbricano ciò che l'owner dovrebbe produrre**: un
  `documentId` o un ordine di eventi che nel flusso reale viene dal service,
  o una persistenza asserita su una tabella che il codice non scrive.

## Barra di ritenzione (non si tocca anche se sembra statico o lento)

Statico o lento non è un motivo per cancellare. Restano:

- Protocollo AdE: payload, header, sequenze derivate da `HAR.md`
  (`src/lib/ade/real-client.test.ts`, `mapper.test.ts`).
- Importi e arrotondamenti (skill `money-rounding`): ogni caso limite.
- Migrazioni, schema, RLS (`src/db/rls-coverage.test.ts`,
  `tests/unit/db-schema-*.test.ts`, `scripts-migrate.test.ts`).
- Sicurezza: CSP, redazione log, limiti di body, rate limit, IDOR, cifratura.
- Contratto pubblico `/api/v1` (consumer esterni, regola 28b).
- Default e soglie in `docs/architecture/config-manifest.md`.
- Gate di repo: `check-architecture-docs`, `next-config-imports`,
  `instrumentation` (confine edge), hook test.
- **Ispezione del sorgente** (`*.contract.test.ts`, `readFileSync` sul
  sorgente) è valida quando è la guardia più economica di un contratto
  visibile all'utente o al build, e sopravvive a un rename di
  identificatori. `viewport.test.ts` che verifica l'export del viewport nel
  dashboard layout lo è: senza, `safe-area-inset` torna `0px` e nessun test
  di componente se ne accorge.
- Un test rosso al baseline può essere un bug di prodotto: riproduci e
  ripara all'owner, non cancellare il test.

## Audit: il workflow

L'audit è **read-only fino al report**. Prima si raccolgono le prove, poi si
consegna il ledger all'utente, poi si edita a lotti coerenti per owner.
Pochi candidati ad alta confidenza battono una lista lunga. Mai ottimizzare
per righe cancellate.

### 1. Baseline

Lancia `npx vitest run` e registra l'esito di ogni file in scope. I file
rossi vanno in una lista a parte: sono candidati bug, non test da togliere.
Conta righe di test e di produzione separate (vanno nella tabella di costo
del `decision-ledger`).

### 2. Corsie per owner

Dividi la superficie per **modulo di produzione che possiede il
comportamento**, non per cartella di test. Un modulo con suite in `src/` e
in `tests/unit/` è una corsia sola.

### 3. Ledger per dichiarazione

Leggi ogni test della corsia per intero (tabelle `it.each` comprese), poi il
modulo di produzione, i chiamanti e la storia (`git log -- <file>`). Ogni
`it` riceve un marchio con una riga di evidenza:

- **R** — tieni: nomina il contratto e il bug che cattura;
- **F** — tieni il contratto, ripara l'asserzione (negativo debole, config
  copiata);
- **C** — consolida: nomina il keeper che assorbe l'asserzione _prima_ di
  togliere l'originale;
- **D** — cancella: nomina la prova che resta, o perché non c'è contratto.

Per ogni C/D registra: nome e posizione, il guasto che rilevava, la prova
più forte rimasta, il seam di produzione che si sblocca, il comando di
verifica. Senza evidenza, niente cancellazione.

### 4. Piano per livello

Il ledger è input, non lista di edit. Un secondo passaggio cerca il
**livello** ridondante (tipicamente un'intera suite di `tests/unit/`
sopra la suite colocata dello stesso modulo) e nomina il keeper per
ogni contratto. Il keeper non è per forza la suite colocata: per la
lista v1 era quella di `tests/unit/`, l'unica che simulava le query
vere, e si è spostata accanto alla route.

### 5. Cutover

Edita corsia per corsia. Con ogni corsia togli i seam di produzione che
sblocca (export `reset…ForTest`, parametri di iniezione). Aggiorna le skill
che citano i file spostati (`npm run arch:check` ti dice quali) e il
`JSDOM_TS_TESTS` di `vitest.config.ts` se sposti un `.test.ts` che usa il
DOM.

### 6. Prova di conservazione: la mutazione

Per ogni contratto consolidato o riparato, fai **una** modifica deliberata
al codice di produzione (togli `"password"` da `REDACT_PATHS`, inverti un
guard) e verifica che il keeper vada rosso. Poi ripristina il sorgente
byte per byte (`git diff --exit-code -- src/<file>`). Un keeper che resta
verde alla mutazione non è un keeper.

### 7. Validazione e consegna

I comandi del Pre-PR in `CLAUDE.md`, con `npm run test:coverage` intero (un
modulo può avere suite parallele, e la soglia per file è il gate che una
cancellazione rompe più spesso). Poi il ledger delle decisioni con la
tabella di costo (skill `decision-ledger`): righe tolte divise tra test,
supporto e produzione, contratti mantenuti, seam rimossi, bug trovati. I
finding che non si chiudono nel lotto diventano issue (regola 33).
