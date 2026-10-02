/**
 * Righe del documento di reso, nel formato di `commercial_document_lines`.
 *
 * Le righe di un reso sono quelle della vendita con la quantità resa e la sua
 * quota di sconto di riga: così PDF, storico e analytics le leggono con
 * l'aritmetica canonica in centesimi (`calcInputLinesTotalCents`, skill
 * `money-rounding`) senza un ramo nuovo.
 *
 * La quota di sconto è **telescopica**: si calcola lo sconto spettante ai pezzi
 * resi fino a questo reso compreso, e si sottrae quello spettante ai pezzi resi
 * prima. Arrotondare ogni quota da sola farebbe perdere o creare centesimi
 * (100 cent in terzi: 33 + 33 + 33 = 99); così la somma dei resi chiude sempre
 * esattamente sullo sconto della vendita. L'AdE invece riceve la proporzione
 * piena a 8 decimali (`return-mapper.ts`, HAR.md #19c): sono due grandezze
 * diverse, e il centesimo di scarto fra le due sul singolo reso è atteso.
 */
import type { SelectCommercialDocumentLine } from "@/db/schema";

export type SaleLineRow = Pick<
  SelectCommercialDocumentLine,
  | "lineIndex"
  | "description"
  | "quantity"
  | "grossUnitPrice"
  | "lineDiscount"
  | "vatCode"
>;

export type ReturnLineRow = SaleLineRow;

/** Quantità (numeric del DB o numero) in centesimi interi. */
function toHundredths(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/**
 * @param saleLines        righe della vendita, in ordine di `lineIndex`
 * @param returnedBefore   pezzi già resi per riga (cumulativo AdE), allineati
 * @param quantities       pezzi resi adesso per riga, allineati; 0 = non resa
 */
export function buildReturnLines(
  saleLines: readonly SaleLineRow[],
  returnedBefore: readonly number[],
  quantities: readonly number[],
): ReturnLineRow[] {
  if (
    returnedBefore.length !== saleLines.length ||
    quantities.length !== saleLines.length
  ) {
    throw new Error("Righe del reso non allineate alla vendita");
  }

  return saleLines.flatMap((line, i) => {
    const now = toHundredths(quantities[i]!);
    if (now === 0) return [];

    const sold = toHundredths(line.quantity);
    const before = toHundredths(returnedBefore[i]!);
    const discountCents = toHundredths(line.lineDiscount);
    const share = (pieces: number) =>
      Math.round((discountCents * pieces) / sold);

    return [
      {
        lineIndex: line.lineIndex,
        description: line.description,
        quantity: String(now / 100),
        grossUnitPrice: line.grossUnitPrice,
        lineDiscount: ((share(before + now) - share(before)) / 100).toFixed(2),
        vatCode: line.vatCode,
      },
    ];
  });
}
