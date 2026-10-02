import type { PrintableReceipt } from "@/lib/printing/types";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import type { ReceiptListItem } from "@/types/storico";

/**
 * Copia stampabile di una riga dello storico, da consegnare al cliente che
 * torna al banco a chiederla. `null` = il bottone ripiega sul PDF.
 *
 * Su una vendita annullata NON è più la ricevuta di vendita — quella non è
 * più un documento valido, e infatti le route PDF si rifiutano di servirla
 * (`isPrintableDocument`) — ma la **ricevuta di annullamento**: stesse righe,
 * riferimento all'originale, progressivo e istante dell'annullo. Le righe
 * sono già in `receipt.lines`: nessuna fetch aggiuntiva.
 *
 * Condivisa dal dettaglio e dalla conferma del reso, che stampa il reso
 * appena riletto: la stessa riga deve dare la stessa carta.
 */
export function toPrintableReceipt(
  receipt: ReceiptListItem,
  printProfile: ReceiptPrintProfile | null,
  origin: string,
): PrintableReceipt | null {
  // Il gate sulle righe è lo stesso di `ReceiptSuccess`: un documento senza
  // righe (dato degenere/legacy — `linesByDocId.get(doc.id) ?? []` in
  // `searchReceipts`) produrrebbe uno scontrino termico con zero articoli e
  // "TOTALE COMPLESSIVO 0,00" consegnato al cliente.
  if (!printProfile || !receipt.adeProgressive || receipt.lines.length === 0) {
    return null;
  }

  const base = {
    header: printProfile.header,
    lines: receipt.lines,
  };

  // Il reso porta le sue righe (pezzi resi e quota di sconto) e cita la
  // vendita. Senza la vendita (FK ON DELETE SET NULL) non c'è riferimento
  // da stampare: il bottone ripiega sul PDF, che lo rilegge dal DB.
  if (receipt.kind === "RETURN") {
    if (!receipt.returnOf) return null;
    return {
      ...base,
      kind: "RETURN",
      adeRegisteredAt: new Date(receipt.adeRegisteredAt),
      adeProgressive: receipt.adeProgressive,
      referenceDocument: {
        adeProgressive: receipt.returnOf.adeProgressive,
        adeRegisteredAt: new Date(receipt.returnOf.adeRegisteredAt),
      },
      publicUrl: `${origin}/r/${receipt.id}`,
    };
  }

  if (receipt.voidDocument) {
    return {
      ...base,
      kind: "VOID",
      adeRegisteredAt: new Date(receipt.voidDocument.adeRegisteredAt),
      adeProgressive: receipt.voidDocument.adeProgressive,
      referenceDocument: {
        adeProgressive: receipt.adeProgressive,
        adeRegisteredAt: new Date(receipt.adeRegisteredAt),
      },
      publicUrl: `${origin}/r/${receipt.voidDocument.id}`,
    };
  }

  // La ristampa di una vendita porta il messaggio di cortesia come la stampa
  // in cassa e come il PDF dello stesso documento: le rese non divergono.
  // Annullo e reso qui sopra non lo portano, e il tipo lo impedisce.
  return {
    ...base,
    kind: "SALE",
    paymentMethod: receipt.paymentMethod,
    payments: receipt.payments,
    lotteryCode: receipt.lotteryCode,
    globalDiscountCents: receipt.globalDiscountCents,
    footerNote: printProfile.footerNote,
    adeRegisteredAt: new Date(receipt.adeRegisteredAt),
    adeProgressive: receipt.adeProgressive,
    publicUrl: `${origin}/r/${receipt.id}`,
  };
}
