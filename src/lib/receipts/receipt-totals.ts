/**
 * Matematica monetaria degli scontrini — **puro, client-safe**.
 *
 * Separato da `document-lines.ts` per la stessa ragione per cui
 * `plans-shared.ts` è separato da `plans.ts`: quel modulo importa `getDb()`, e
 * qualunque componente client che ne tiri dentro anche solo una funzione pura
 * si porterebbe appresso il driver `postgres` nel bundle del browser. Se ne è
 * accorto il build quando la stampa termica ha iniziato a riusare
 * `computeReceiptTotals` da un client component.
 *
 * Qui NON deve mai comparire un import di `@/db`.
 *
 * Canone (regola 17): centesimi interi per riga —
 * `round(grossUnitPrice * quantity * 100)` — sommati come interi, MAI un
 * arrotondamento per documento. È ciò che tiene allineati al centesimo il
 * totale trasmesso all'AdE, il PDF, la pagina pubblica, lo scontrino di carta
 * e le analytics.
 */

/**
 * Minimo strutturale richiesto per calcolare i totali: i soli campi che vi
 * concorrono. Lo soddisfano `SelectCommercialDocumentLine` (DB),
 * `ReceiptLineItem` (storico) e `PrintableReceiptLine` (stampa termica), così
 * ogni superficie deriva gli importi da qui invece di riscriverne una copia.
 */
export interface ReceiptLineAmounts {
  readonly quantity: string | null;
  readonly grossUnitPrice: string | null;
  readonly vatCode: string;
}

export interface ReceiptLineCalc {
  readonly qty: number;
  readonly price: number;
  /** Line total (qty * price) rounded to 2 decimals. */
  readonly lineTotal: number;
}

export interface ReceiptTotals {
  readonly perLine: readonly ReceiptLineCalc[];
  /** Sum of all line totals, rounded to 2 decimals. */
  readonly grandTotal: number;
  /** VAT amount per vatCode, each rounded to 2 decimals (only entries > 0). */
  readonly vatByCode: ReadonlyMap<string, number>;
  /**
   * IVA complessiva del documento — la riga `di cui IVA` del layout AdE.
   *
   * Sommata in centesimi interi PRIMA della conversione in euro: sommare i
   * valori già arrotondati di `vatByCode` deriverebbe da float e potrebbe
   * scostarsi di un centesimo dal totale che le stesse righe producono
   * altrove (regola 17).
   */
  readonly vatTotal: number;
}

/**
 * Calculates the total amount for a document's lines, rounded to 2 decimal places.
 *
 * Uses the CANONICAL per-line rounding strategy: each line is rounded to
 * integer cents (`round(qty * price * 100)`) and the cents are summed, exactly
 * like `computeReceiptTotals` and `calcInputLinesTotalCents`. This guarantees
 * that the total shown in the storico/analytics matches the total on the PDF,
 * the public receipt page and the amount transmitted to AdE — they all derive
 * from the same per-line cents. (Historically this rounded the float sum once
 * per document, which drifted by 1 cent from the per-line surfaces on
 * fractional quantities — REVIEW.md #1.)
 */
export function calcDocTotal(lines: readonly ReceiptLineAmounts[]): number {
  return (
    lines.reduce(
      (sum, l) =>
        sum +
        Math.round(
          Number.parseFloat(l.grossUnitPrice ?? "0") *
            Number.parseFloat(l.quantity ?? "1") *
            100,
        ),
      0,
    ) / 100
  );
}

/**
 * Sums input lines (numeric `grossUnitPrice`/`quantity`, as produced by the
 * cassa/API before persistence) into integer cents using the CANONICAL
 * per-line rounding: `round(grossUnitPrice * quantity * 100)` per line, summed
 * as integers.
 *
 * Same formula as `computeReceiptTotals`/`calcDocTotal`, so the amount sent to
 * AdE (`payments[0].amount`) and the lottery €1,00 threshold reconcile to the
 * cent with the PDF, the public receipt page and the storico/analytics.
 */
export function calcInputLinesTotalCents(
  lines: ReadonlyArray<{ grossUnitPrice: number; quantity: number }>,
): number {
  return lines.reduce(
    (sum, l) => sum + Math.round(l.grossUnitPrice * l.quantity * 100),
    0,
  );
}

/**
 * Computes deterministic totals for a receipt using cents-based integer math.
 * All summations and VAT splits happen in integer cents, then converted back
 * to euros at the end. This avoids IEEE-754 drift visible to users when many
 * lines or fractional quantities accumulate (e.g. 0.1 + 0.2 ≠ 0.3 in float).
 *
 * Used by the public receipt page, the PDF renderer and the thermal printer.
 */
export function computeReceiptTotals(
  lines: readonly ReceiptLineAmounts[],
): ReceiptTotals {
  const perLine: ReceiptLineCalc[] = [];
  const vatByCodeCents = new Map<string, number>();
  let grandTotalCents = 0;

  for (const line of lines) {
    const qty = Number.parseFloat(line.quantity ?? "1");
    const price = Number.parseFloat(line.grossUnitPrice ?? "0");
    const lineTotalCents = Math.round(qty * price * 100);
    grandTotalCents += lineTotalCents;

    perLine.push({ qty, price, lineTotal: lineTotalCents / 100 });

    const rate = Number.parseFloat(line.vatCode);
    if (Number.isNaN(rate) || rate === 0) continue;

    // VAT = gross − gross / (1 + rate/100). Computed in cents to keep precision.
    const netCents = Math.round(lineTotalCents / (1 + rate / 100));
    const vatCents = lineTotalCents - netCents;
    if (vatCents <= 0) continue;

    vatByCodeCents.set(
      line.vatCode,
      (vatByCodeCents.get(line.vatCode) ?? 0) + vatCents,
    );
  }

  const vatByCode = new Map<string, number>();
  let vatTotalCents = 0;
  for (const [code, cents] of vatByCodeCents.entries()) {
    vatByCode.set(code, cents / 100);
    vatTotalCents += cents;
  }

  return {
    perLine,
    grandTotal: grandTotalCents / 100,
    vatByCode,
    vatTotal: vatTotalCents / 100,
  };
}
