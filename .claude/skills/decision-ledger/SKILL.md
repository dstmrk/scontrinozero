---
name: decision-ledger
description: Use when closing out a task and handing work back to the user — writing the PR description, summarizing what was built, auditing the decisions taken where the prompt or the spec was silent, or reporting the size/cost of a change. Covers the choices ledger (what counts as a decision vs. an implementation detail, the entry format, triage into solida/da-rivedere/serve-l-utente with a confidence, ordering least-confident first, why "it works" is not a verdict, why an empty ledger on substantial work is a symptom), where each entry goes afterwards (PR body, promoted into the owning skill as a durable invariant, or a REVIEW.md finding), and the mandatory cost table (added/deleted/net split across production code, comments, tests, docs, plus the new structural surfaces the user now owns). CLAUDE.md regola 32.
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

## Dove finisce ogni voce

Il ledger vive nella **descrizione della PR** — è lì che avviene la review.
Volutamente **non** creiamo un registro dedicato accanto a `PLAN.md`,
`REVIEW.md` e `docs/architecture/`: un quarto posto dove scrivere è un quarto
posto che invecchia. Da lì ogni voce ha una sola destinazione durevole:

| Verdetto                              | Destinazione                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| solida + diventa invariante           | promossa nella skill che possiede il dominio (regola 7)                      |
| solida + resta un dettaglio           | resta nella PR, nient'altro da fare                                          |
| da rivedere, non risolta in questa PR | riga in `REVIEW.md` nella sezione di priorità giusta                         |
| serve l'utente                        | resta nella PR con la chiamata provvisoria dichiarata, in attesa di risposta |

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
