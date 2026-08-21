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
  /**
   * Sconto di riga, lordo e già comprensivo della quantità — la grandezza
   * `scontoLordo` del tracciato AdE (HAR.md voce #12), non uno sconto per
   * unità. Colonna `line_discount` (migrazione 0034).
   *
   * ⚠️ Si sottrae **prima** dello scorporo IVA: è ciò che distingue lo sconto
   * di riga dallo sconto a pagare (voce #3a). Sbagliare l'ordine significa
   * versare IVA su una base che il cliente non ha pagato.
   *
   * Opzionale/`null` = nessuno sconto: è il caso di ogni riga emessa prima
   * della 0034, che nessuna migrazione riscrive.
   */
  readonly lineDiscount?: string | null;
}

export interface ReceiptLineCalc {
  readonly qty: number;
  readonly price: number;
  /**
   * Totale lordo della riga PRIMA dello sconto (`qty × price`, ai centesimi).
   *
   * Serve alla stampa: il layout normativo AdE mette il prezzo pieno sulla
   * riga dell'articolo e lo sconto su una riga propria sotto, con importo
   * negativo (`HAR.md` voce #17a). Chi stampa un solo numero usa `lineTotal`.
   */
  readonly lineGross: number;
  /** Sconto di riga in euro (0 quando assente). */
  readonly discount: number;
  /** Totale della riga AL NETTO dello sconto, arrotondato ai centesimi. */
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
 * Totale di UNA riga in centesimi interi, al netto dello sconto.
 *
 * Punto unico in cui il canone della regola 17 viene applicato: lordo di riga
 * arrotondato ai centesimi, poi sconto (già di riga, non per unità) sottratto
 * come intero. Le tre funzioni pubbliche di questo modulo lo riusano, così non
 * possono divergere fra loro — e con loro non divergono AdE, PDF, pagina
 * pubblica, termica, storico e analytics.
 *
 * Il `Math.max(0, …)` è difesa in profondità: lo Zod rifiuta uno sconto oltre
 * il totale di riga, ma queste funzioni leggono anche righe già in DB, dove un
 * import o una fix manuale potrebbero averlo scritto. Un totale negativo si
 * propagherebbe fino all'`ammontareComplessivo` trasmesso all'AdE.
 */
function lineTotalCents(
  grossUnitPrice: number,
  quantity: number,
  lineDiscount: number,
): number {
  const grossCents = Math.round(grossUnitPrice * quantity * 100);
  const discountCents = Math.round(lineDiscount * 100);
  return Math.max(0, grossCents - discountCents);
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
        lineTotalCents(
          Number.parseFloat(l.grossUnitPrice ?? "0"),
          Number.parseFloat(l.quantity ?? "1"),
          Number.parseFloat(l.lineDiscount ?? "0"),
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
  lines: ReadonlyArray<{
    grossUnitPrice: number;
    quantity: number;
    lineDiscount?: number;
  }>,
): number {
  return lines.reduce(
    (sum, l) =>
      sum + lineTotalCents(l.grossUnitPrice, l.quantity, l.lineDiscount ?? 0),
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
    const discount = Number.parseFloat(line.lineDiscount ?? "0");
    const grossCents = Math.round(price * qty * 100);
    const totalCents = lineTotalCents(price, qty, discount);
    grandTotalCents += totalCents;

    perLine.push({
      qty,
      price,
      lineGross: grossCents / 100,
      // Lo sconto EFFETTIVAMENTE applicato, non quello dichiarato: se una riga
      // in DB portasse uno sconto oltre il proprio lordo, stampare il valore
      // grezzo darebbe `lordo − sconto ≠ totale` sul documento.
      discount: (grossCents - totalCents) / 100,
      lineTotal: totalCents / 100,
    });

    const rate = Number.parseFloat(line.vatCode);
    if (Number.isNaN(rate) || rate === 0) continue;

    // VAT scorporata dal totale GIÀ SCONTATO: lo sconto di riga riduce la base
    // imponibile (HAR.md voce #3a), quindi l'imposta si calcola su ciò che il
    // cliente paga davvero, non sul prezzo di listino.
    const netCents = Math.round(totalCents / (1 + rate / 100));
    const vatCents = totalCents - netCents;
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
