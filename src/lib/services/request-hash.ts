import { createHash } from "node:crypto";
import type { SubmitReceiptInput } from "@/types/cassa";

/**
 * Fingerprint canonico SHA-256 del payload di una SALE, per rilevare il riuso
 * di una `idempotencyKey` con un payload diverso (P1.4).
 *
 * Deterministico: stesse righe (nello stesso ordine), stesso pagamento e stesso
 * codice lotteria → stesso hash. L'ordine delle righe è significativo (compare
 * sullo scontrino), quindi NON viene riordinato. I numeri sono normalizzati da
 * `JSON.stringify` (10.0 e 10 → "10"), evitando falsi mismatch di formattazione.
 *
 * `lotteryCode` è quello EFFETTIVO (già risolto: null se il pagamento non è PE),
 * così due richieste logicamente identiche non divergono per un campo ignorato.
 *
 * ⚠️ `globalDiscount` entra nella forma canonica **solo quando è > 0**. Un
 * documento senza sconto a pagare deve produrre esattamente l'hash che
 * produceva prima che il campo esistesse: gli hash già persistiti sono
 * immutabili, e includere sempre uno `0` farebbe fallire come
 * `IDEMPOTENCY_PAYLOAD_MISMATCH` il retry di uno scontrino inviato prima del
 * deploy — cioè proprio il caso in cui la stessa key va riusata, perché il
 * documento è PENDING e l'esito AdE è ignoto. Un abbuono, quando c'è, cambia
 * quanto il cliente paga: deve far divergere il fingerprint.
 *
 * Identico trattamento per `lineDiscount` sulla riga, che in più cambia il
 * corrispettivo: due richieste con la stessa key e sconti di riga diversi
 * NON sono lo stesso scontrino, e senza il campo nella forma canonica la
 * seconda passerebbe per replay della prima.
 *
 * ⚠️ Entrambi i call site devono passare gli stessi campi. Un chiamante che
 * ne omette uno ricalcola un hash diverso da quello persistito e trasforma
 * un retry legittimo in `IDEMPOTENCY_PAYLOAD_MISMATCH` — che sul canale
 * emit significa dire all'utente di cambiare key proprio mentre il documento
 * è PENDING, cioè il caso in cui una key nuova rischia il doppione fiscale.
 */
/**
 * Sconto normalizzato in centesimi interi per la forma canonica.
 *
 * Normalizza QUI e non nei chiamanti perché i call site sono due — l'INSERT
 * e il ricalcolo sul conflitto di idempotenza — e uno dei due passava il
 * valore grezzo mentre l'altro passava quello già arrotondato: due input
 * logicamente identici producevano hash diversi. La forma canonica se la
 * possiede questa funzione, non chi la chiama.
 */
function discountCents(value: number | undefined): number {
  return value ? Math.round(value * 100) : 0;
}

export function hashSaleRequest(input: {
  lines: SubmitReceiptInput["lines"];
  paymentMethod: SubmitReceiptInput["paymentMethod"];
  lotteryCode: string | null;
  globalDiscount?: number;
}): string {
  const canonical = JSON.stringify({
    paymentMethod: input.paymentMethod,
    lotteryCode: input.lotteryCode ?? null,
    ...(discountCents(input.globalDiscount)
      ? { globalDiscount: discountCents(input.globalDiscount) }
      : {}),
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      grossUnitPrice: line.grossUnitPrice,
      // Stesso trattamento condizionale di `globalDiscount`, e per lo stesso
      // motivo: incluso solo quando c'è, così le righe senza sconto
      // producono l'hash che producevano prima che il campo esistesse.
      ...(discountCents(line.lineDiscount)
        ? { lineDiscount: discountCents(line.lineDiscount) }
        : {}),
      vatCode: line.vatCode,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
