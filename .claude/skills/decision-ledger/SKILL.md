---
name: decision-ledger
description: Use when closing out a task and handing work back to the user — writing the PR title or description, summarizing what was built, auditing the decisions taken where the prompt or the spec was silent, or reporting the size/cost of a change. Covers the squash-only merge setup (merge commits and rebase are disabled, the commit message comes from the PR title and body, so the PR title is the commit subject and needs a conventional-commit prefix in Italian, the body must be written at ~70 columns and free of HTML entities because GitHub rewraps it at ~72 and destroys list indentation, and both must be written before the merge because afterwards they are immutable history), the choices ledger (what counts as a decision vs. an implementation detail, the entry format, triage into solida/da-rivedere/serve-l-utente with a confidence, ordering least-confident first, why "it works" is not a verdict, why an empty ledger on substantial work is a symptom), where each entry goes afterwards (PR body, promoted into the owning skill as a durable invariant, or a REVIEW.md finding), and the mandatory cost table (added/deleted/net split across production code, comments, tests, docs, plus the new structural surfaces the user now owns). CLAUDE.md regola 32.
---

# decision-ledger — consegna le decisioni, non il diff

La review riga-per-riga non regge il ritmo con cui il codice viene prodotto.
"LGTM" diventa la risposta di default e la qualità deriva verso quello che
sopravvive a una scorsa distratta. La contromisura non è leggere di più. È
spostare la review su un altro oggetto, quello dove il giudizio umano decide
davvero qualcosa: le decisioni.

Questa skill descrive l'artefatto che consegni a fine task. È un **audit puro**:
non modifica codice, test o stato del build.

## Cos'è una decisione (e cosa non lo è)

Una decisione è **una scelta che hai fatto dove il prompt, la spec o
`CLAUDE.md` tacevano, e che un umano potrebbe voler ribaltare.**

Sono decisioni, nel nostro dominio:

- una soglia inventata: rate limit, timeout, `getStalePendingThresholdMs`, un
  limite di paginazione;
- quale piano gate-a una feature nuova (`src/lib/plans.ts`) e cosa vede chi non
  l'ha;
- il comportamento scelto in un caso che la regola 19 non copre alla lettera —
  cosa vede l'utente quando il fallback scatta;
- la forma di un dato che diventa contratto: nome ed enum di una colonna, shape
  della risposta di un endpoint, chiave di idempotenza;
- una classificazione Sentry (`warn` vs `error`) su un errore nuovo (regola 20);
- **una cosa che hai deciso di NON fare** — uno scope firewall — quando
  qualcuno potrebbe ragionevolmente aspettarsela in questa PR;
- una divergenza consapevole da una convenzione esistente nel repo.

Non sono decisioni, e sporcano il ledger se le metti: naming di variabili
interne, ordine degli import, formattazione, e **tutto ciò che una regola di
`CLAUDE.md` già impone** (quella non è una scelta, è conformità).

## Formato di una voce

Ogni voce si deve leggere **da sola**, senza il diff e senza la chat. Chi legge
conosce il business, non il codice: i termini di dominio si spiegano.

```markdown
### <La scelta in una riga — la scelta, non il file toccato>

- **Dove:** slice / area toccata
- **Scenario:** cosa succede all'utente finale, in italiano, end-to-end
- **La spec taceva su:** cosa non era specificato
- **Alternativa scartata:** …e perché ha perso
- **Conseguenze:** cosa diventa più difficile o più costoso da cambiare dopo
- **Verdetto:** solida · da rivedere · serve l'utente — confidence alta/media/bassa
```

## Regole dure

- **"Funziona" non è un verdetto sulla solidità.** La domanda è quale garanzia
  regge il comportamento, non se il test è verde.
- **Ordina dalla meno confidente alla più confidente.** L'attenzione di chi
  legge è finita. Va spesa dove sei meno sicuro, non dove sei tranquillo.
- **Una lista vuota su un lavoro sostanzioso è un sintomo**, non un buon segno:
  vuol dire che non hai ripercorso la sessione. Rileggila e ritrova le scelte.
- **L'audit non blocca.** Una voce "serve l'utente" rimasta senza risposta non
  ferma la consegna: adotti la chiamata provvisoria, la dichiari come tale,
  tieni la scelta reversibile e vai avanti.
- **Una voce banca una volta sola.** Quello che è già stato deciso e accettato
  in una PR precedente non si ri-elenca.

## Cosa NON ci va

Risultati dei gate, evidenze dei test, narrazione delle review finding,
changelog delle modifiche. Quelli si riportano altrove: il ledger contiene
**solo decisioni che l'utente ora possiede**.

## Il corpo della PR è un messaggio di commit

Il repo mergia **solo in squash** (merge commit e rebase sono disabilitati), con
il messaggio del commit preso da titolo e descrizione della PR. Quindi il corpo
della PR non è una nota di passaggio: diventa **storia git**, la stessa che
raggiungi con `git log` e a cui ti porta `git blame` da una riga sospetta. È il
motivo per cui il ledger vive lì e non in un file dedicato accanto a `PLAN.md`,
`REVIEW.md` e `docs/architecture/`: un quarto posto dove scrivere sarebbe un
quarto posto che invecchia, e non servirebbe comunque a niente in più.

Tre conseguenze operative.

**Il titolo della PR è il soggetto del commit.** Va scritto come tale: prefisso
conventional-commit e italiano, come i commit del repo (`docs: …`, `fix(ade):
…`). Un titolo generato in automatico, in inglese e senza prefisso, finisce su
`main` per sempre.

**Il corpo va scritto per come GitHub lo riscrive, non per come si legge sul
web.** Nel trasformarlo in messaggio di commit GitHub **rimanda a capo il testo
a ~72 colonne**, e lo fa in modo grezzo: spezza le frasi a metà parola-chiave e
**perde l'indentazione di continuazione** delle liste. Misurato sul commit
`a5910d6`, dove un corpo scritto a 80 colonne è arrivato su `main` con le
continuazioni dei bullet a colonna zero (3 righe su tutto il corpo hanno
mantenuto l'indent) e una riga contenente la sola parola "e". Come prosa si
legge; come documento strutturato no. Quindi:

- scrivi a **~70 colonne**, così il riflusso di GitHub non ha niente da tagliare;
- **niente significato affidato all'indentazione**: bullet di una riga sola,
  oppure paragrafi con un lead-in in grassetto al posto delle liste con
  continuazione;
- niente entità HTML (`&#34;`, `&gt;`) lasciate da un editor;
- i tag in stile HTML **sembrano** spariti quando rileggi corpo o messaggio di
  commit dagli strumenti GitHub, ma è un artefatto di **lettura**, non un
  danno allo storage. Misurato sulla PR #896: un commit contenente
  `` `<PaymentMethodSelector/>` `` torna dall'API senza il tag, mentre
  `git log -1 --format=%B` sullo stesso commit ce l'ha. Prima di "riparare" un
  testo che sembra mangiato, **verificalo contro git**: rincorrere l'artefatto
  costa un giro di modifiche inutili. Nel dubbio su un corpo di PR, che in git
  non c'è, cita i componenti JSX per nome in prosa — costa nulla e toglie
  l'ambiguità;
- le tabelle sopravvivono, perché le loro righe sono già corte: tienile strette.

**Si scrive prima del merge.** Dopo, è storia immutabile: correggerla vuol dire
riscrivere `main`, cioè non si fa. Il ledger non è un commento da aggiungere
quando ci si ricorda.

> ⚠️ Lo squash crea un commit **nuovo**: il branch mergiato non è un antenato di
> `main`. Riusarlo per il lavoro successivo ripropone il diff già mergiato. Per
> un follow-up si riparte da `main`
> (`git checkout -B <branch> origin/main`), sempre, anche tenendo lo stesso
> nome.

## Dove finisce ogni voce

Il commit risponde a "perché è così". Non risponde a "cosa devo fare la
prossima volta" né a "cosa è rimasto aperto": per quelle due domande nessuno va
a scavare nella storia. Quindi ogni voce ha anche una destinazione fuori dalla
PR:

| Verdetto                              | Destinazione                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| solida + diventa invariante           | promossa nella skill che possiede il dominio (regola 7)                      |
| solida + resta un dettaglio           | resta nella PR, nient'altro da fare                                          |
| da rivedere, non risolta in questa PR | riga in `REVIEW.md` nella sezione di priorità giusta                         |
| serve l'utente                        | resta nella PR con la chiamata provvisoria dichiarata, in attesa di risposta |

I messaggi dei commit intermedi, invece, non sopravvivono allo squash: sono
appunti di lavoro. Non metterci niente che non sia anche nel corpo della PR.

## La tabella del costo (sempre per ultima, dopo il ledger)

Il ledger dice **cosa** è stato deciso; questa dice **quanto è costato**.

```bash
git diff --stat main...HEAD
```

|                                    | aggiunte | tolte | netto |
| ---------------------------------- | -------- | ----- | ----- |
| Codice di produzione (no commenti) |          |       |       |
| Commenti                           |          |       |       |
| Test e fixture                     |          |       |       |
| Doc e skill                        |          |       |       |

Poi **un paragrafo** che nomina le **superfici strutturali** nuove — quelle che
l'utente adesso mantiene e che un conteggio di righe nasconde: una colonna, un
indice, un endpoint, una env var, un hook, una dipendenza, un file di config.
Su un hobby project a costi fissi ~€0 e "un solo container" (Principi guida),
questa riga conta più del totale.

Escludi il churn del formatter su file che il lavoro non ha toccato per altri
motivi — e **dichiara** di averlo escluso.

**Il numero si dichiara sempre, qualunque sia.** Una grossa aggiunta netta per
un cambio di comportamento piccolo è un finding da riportare, non un numero da
seppellire: se te ne accorgi qui e non nel momento in cui è successo, dì anche
in quale passaggio è successo.

## Template pronto per la PR

```markdown
## Decisioni prese dove la spec taceva

> Audit puro: nessuna modifica al codice. Ordinate dalla meno confidente.

### 1. <titolo> — _da rivedere, confidence bassa_

…

### 2. <titolo> — _solida, confidence alta_

…

## Costo

| …   | aggiunte | tolte | netto |
| --- | -------- | ----- | ----- |

**Superfici strutturali nuove:** …
```
