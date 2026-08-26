---
name: money-rounding
description: Use when touching money amounts, receipt totals, rounding, revenue aggregation or rankings — the canonical arithmetic in src/lib/receipts/receipt-totals.ts (calcInputLinesTotalCents, calcDocTotal, computeReceiptTotals — pure and client-safe, re-exported by src/lib/receipts/document-lines.ts), the amount transmitted to AdE (payments[0].amount), the €1.00 lottery threshold, PDF/public receipt page/thermal print totals, analytics revenue KPIs and product breakdowns, or any sort that precedes a slice/topN. Canon: per-line cents rounding — round(grossUnitPrice*quantity*100) per line, summed as integers — NEVER per-document rounding; always add a stable secondary sort key before slice/topN.
---

# money-rounding — strategia canonica per gli importi monetari

## La regola in una riga

**Per-riga in cents**: `round(grossUnitPrice * quantity * 100)` per ogni riga,
sommato come **interi**. Mai arrotondare per documento (somma float poi un solo
`round`). Mai una seconda strategia "locale" in un modulo nuovo: la strategia
canonica è una sola, ovunque.

## Helper condivisi — usali, non reimplementare

Vivono in `src/lib/receipts/receipt-totals.ts`, modulo **puro e client-safe**:

- `calcInputLinesTotalCents` — righe di input **numeriche** (cassa, API)
- `calcDocTotal` — righe lette dal **DB** (storico, analytics)
- `calcLineTotalCents` — **UNA riga** letta dal DB, al netto dello sconto
- `computeReceiptTotals` — totali completi per PDF, pagina pubblica e stampa
  termica (espone anche `perLine`, con `lineGross`, `discount` e `lineTotal`)

Ogni nuovo punto che tocca un totale monetario deve passare da questi helper.

### L'unica eccezione ammessa: il gemello SQL del pannello operatore

C'è **un solo** posto in cui la formula è riscritta fuori da
`receipt-totals.ts`: `lineCentsSql` in `src/server/admin-metrics.ts`, la
traduzione in Postgres di `lineTotalCents`.

Perché esiste: quel pannello aggrega su **tutti** i tenant, e tirarsi in memoria
ogni riga di ogni scontrino per sommarle sarebbe l'unica parte del progetto che
cresce linearmente col fatturato di tutti. Non è una svista da collassare: è la
sola forma che regge, e le due formule si citano a vicenda nei commenti.

Perché è pericolosa: **nessun test le confronta**. Una gira in JS, l'altra nel
database; non esiste un assert che le veda entrambe. `round()` di Postgres su
`numeric` è esatto, `Math.round` di JS parte da un float64: dove differiscono ha
ragione Postgres, ma se la formula stessa diverge il pannello mostra un incasso
diverso da quello degli scontrini che lo compongono, e nessuno se ne accorge.

Regola operativa: se tocchi `lineTotalCents`, apri anche `admin-metrics.ts`
nello stesso PR. Se stai per aggiungere un **secondo** gemello SQL, fermati e
chiedi: la deroga vale per un'aggregazione cross-tenant, non per comodità.

### Se una superficie mostra UNA riga, c'è un helper anche per quella

`calcLineTotalCents` e il `perLine` di `computeReceiptTotals` esistono per un
motivo preciso, imparato a caro prezzo con gli sconti di riga (v1.7.4): finché
il modulo esponeva solo funzioni per l'**intero documento**, chi doveva
mostrare il totale di una singola riga non aveva alternativa a riscrivere
`round(qty * price * 100)` a mano. Su cinque superfici che lo facevano, **tre
sbagliavano** appena è comparso un campo nuovo sulla riga:

- il PDF stampava 160,65 dove termica, pagina pubblica e payload AdE dicevano
  150,00, perché `generatePdfResponse` rimappava le righe in un tipo locale che
  non dichiarava lo sconto (TypeScript non se ne accorgeva);
- la ripartizione prodotti in analytics attribuiva il prezzo di listino,
  rompendo la riconciliazione col KPI dichiarata qui sotto;
- il dialogo di annullo faceva confermare l'annullo su un totale più alto del
  reale.

Regola operativa: **se stai per scrivere `qty * price` fuori da
`receipt-totals.ts`, fermati.** Non è una svista che una review riga-per-riga
intercetta — il codice sbagliato è indistinguibile da quello giusto finché non
esiste il campo che dimentica. E se aggiungi un campo che concorre al totale di
riga, cerca ogni tipo locale che rimappa le righe (`grep -rn "grossUnitPrice"`
escludendo i test): un tipo che non lo dichiara è un totale sbagliato che
compila.

⚠️ **Importa sempre da `src/lib/receipts/receipt-totals.ts`, non dal wrapper.**
`src/lib/receipts/document-lines.ts` re-esporta gli stessi simboli (comodo lato
server, dove aggiunge anche `fetchLinesByDocIds`/`groupLinesByDocId`) ma importa
`getDb()`: un Client Component che ne tiri dentro anche solo `computeReceiptTotals`
si porta il driver `postgres` nel bundle del browser. È il motivo per cui i due
moduli sono separati — stessa logica di `plans-shared.ts` vs `plans.ts` — ed è
emerso quando la stampa termica ha iniziato a riusare `computeReceiptTotals` da
client.

## Dove si applica (tutte le superfici)

| Superficie                 | Punto                                  |
| -------------------------- | -------------------------------------- |
| Importo trasmesso ad AdE   | `payments[0].amount`                   |
| Soglia lotteria €1,00      | stesso totale per-riga                 |
| PDF / pagina pubblica      | `computeReceiptTotals`                 |
| Stampa termica ESC/POS     | `computeReceiptTotals` (stesso helper) |
| Storico / analytics (KPI)  | `calcDocTotal`                         |
| Breakdown prodotti (top-N) | somma `calcLineTotalCents` sulle righe |
| Dialogo di annullo         | `computeReceiptTotals` (`perLine`)     |
| Export CSV dettaglio riga  | `calcLineTotalCents`                   |

## Perché mai per-documento (REVIEW.md #1)

La strategia per-documento (somma float, poi un solo `round`) **divergeva di
1 cent** dalla somma delle righe su quantità frazionarie: il documento fiscale
trasmesso ad AdE differiva da quello consegnato al cliente. Era stata scelta
nei PR #519 e #534, poi **superata** da REVIEW.md #1 — non reintrodurla
citando quei PR come precedente.

## Riconciliazione KPI ↔ breakdown

Poiché sia il KPI ricavo (somma `calcDocTotal` sui documenti) sia il breakdown
prodotti sommano lo **stesso** `calcLineTotalCents` su tutte le righe, i due
totali riconciliano alla cifra indipendentemente dal raggruppamento
documento↔prodotto. Se un nuovo aggregato non riconcilia, sta usando una
strategia diversa: è un bug, non un dettaglio.

⚠️ **Questa invariante va testata confrontando le due viste**, non asserendo
due numeri attesi scritti a mano. Quando lo sconto di riga è entrato in
`calcDocTotal` ma non nel breakdown, ogni test esistente restava verde: erano
tutti su una vista sola. Il test che l'ha inchiodata somma il breakdown e lo
confronta con `calcDocTotal` sulle stesse righe.

## Ordini deterministici prima di slice/topN

Ogni `sort` che precede uno `slice`/topN deve avere una **chiave secondaria
stabile** (es. descrizione normalizzata) oltre alla metrica primaria: ordinare
sui soli `revenueCents` rende l'output non deterministico sui pareggi (test
flaky e ranking che "ballano" tra render).

```ts
rows.sort(
  (a, b) =>
    b.revenueCents - a.revenueCents ||
    a.normalizedDescription.localeCompare(b.normalizedDescription),
);
```

## Nota TDD

Il test giusto asserisce la **grandezza user-facing** (il totale mostrato /
trasmesso), non il trasformatore intermedio: un test verde che codifica la
strategia sbagliata è peggio di nessun test (vedi la trappola gemella sulle
date derivate nella skill `stripe-webhooks`, sezione referral).
