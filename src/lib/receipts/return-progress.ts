/**
 * A che punto sono i resi di una vendita, dalle righe dello storico.
 *
 * Client-safe: lo leggono l'elenco (badge "Reso parziale/totale") e il
 * dettaglio (niente annullo su una vendita resa). Conta i resi registrati da
 * ScontrinoZero (`ReceiptLineItem.returnedQuantity`); quelli fatti dal portale
 * AdE li vede solo il servizio, che rilegge il dettaglio AdE prima di agire.
 */
export type SaleReturnProgress = "none" | "partial" | "full";

/** Quantità (numeric del DB come stringa) in centesimi interi. */
function toHundredths(value: string): number {
  return Math.round(Number(value) * 100);
}

export function saleReturnProgress(
  lines: readonly { quantity: string; returnedQuantity: string }[],
): SaleReturnProgress {
  const returned = lines.map((l) => toHundredths(l.returnedQuantity));
  if (!returned.some((q) => q > 0)) return "none";
  const allReturned = lines.every(
    (l, i) => returned[i] >= toHundredths(l.quantity),
  );
  return allReturned ? "full" : "partial";
}

/** Pezzi ancora rendibili di una riga: venduti meno già resi, mai sotto 0. */
export function returnableQuantity(line: {
  quantity: string;
  returnedQuantity: string;
}): number {
  return (
    Math.max(
      0,
      toHundredths(line.quantity) - toHundredths(line.returnedQuantity),
    ) / 100
  );
}

/** Numero con al massimo due decimali, punto o virgola: niente `1e1`. */
const QUANTITY_INPUT = /^\d+(?:[.,]\d{1,2})?$/;

/**
 * Quantità digitata nel dialog di reso → pezzi da rendere, o `null` se non
 * è trasmissibile. Vuoto vale 0 (riga non resa). Due decimali al massimo,
 * come accetta il portale (`validateReturnQuantities`); il tetto è il
 * rendibile della riga.
 */
export function parseReturnQuantityInput(
  raw: string,
  max: number,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (!QUANTITY_INPUT.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  return toHundredths(String(value)) > Math.round(max * 100) ? null : value;
}
