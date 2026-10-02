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
