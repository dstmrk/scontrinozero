---
name: money-rounding
description: Use when touching money amounts, receipt totals, rounding, revenue aggregation or rankings — receipt line totals in src/lib/receipts/document-lines.ts (calcInputLinesTotalCents, calcDocTotal), the amount transmitted to AdE (payments[0].amount), the €1.00 lottery threshold, PDF/public receipt page totals (computeReceiptTotals), analytics revenue KPIs and product breakdowns, or any sort that precedes a slice/topN. Canon: per-line cents rounding — round(grossUnitPrice*quantity*100) per line, summed as integers — NEVER per-document rounding; always add a stable secondary sort key before slice/topN.
---

# money-rounding — strategia canonica per gli importi monetari

## La regola in una riga

**Per-riga in cents**: `round(grossUnitPrice * quantity * 100)` per ogni riga,
sommato come **interi**. Mai arrotondare per documento (somma float poi un solo
`round`). Mai una seconda strategia "locale" in un modulo nuovo: la strategia
canonica è una sola, ovunque.

## Helper condivisi — usali, non reimplementare

In `src/lib/receipts/document-lines.ts`:

- `calcInputLinesTotalCents` — righe di input **numeriche** (cassa, API)
- `calcDocTotal` — righe lette dal **DB** (storico, analytics)

Ogni nuovo punto che tocca un totale monetario deve passare da questi helper
(o da `computeReceiptTotals` per PDF/pagina pubblica, che li usa sotto).

## Dove si applica (tutte le superfici)

| Superficie                 | Punto                                    |
| -------------------------- | ---------------------------------------- |
| Importo trasmesso ad AdE   | `payments[0].amount`                     |
| Soglia lotteria €1,00      | stesso totale per-riga                   |
| PDF / pagina pubblica      | `computeReceiptTotals`                   |
| Storico / analytics (KPI)  | `calcDocTotal`                           |
| Breakdown prodotti (top-N) | somma `round(qty*price*100)` sulle righe |

## Perché mai per-documento (REVIEW.md #1)

La strategia per-documento (somma float, poi un solo `round`) **divergeva di
1 cent** dalla somma delle righe su quantità frazionarie: il documento fiscale
trasmesso ad AdE differiva da quello consegnato al cliente. Era stata scelta
nei PR #519 e #534, poi **superata** da REVIEW.md #1 — non reintrodurla
citando quei PR come precedente.

## Riconciliazione KPI ↔ breakdown

Poiché sia il KPI ricavo (somma `calcDocTotal` sui documenti) sia il breakdown
prodotti sommano lo **stesso** `round(qty*price*100)` su tutte le righe, i due
totali riconciliano alla cifra indipendentemente dal raggruppamento
documento↔prodotto. Se un nuovo aggregato non riconcilia, sta usando una
strategia diversa: è un bug, non un dettaglio.

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
