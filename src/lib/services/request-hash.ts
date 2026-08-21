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
 */
export function hashSaleRequest(input: {
  lines: SubmitReceiptInput["lines"];
  paymentMethod: SubmitReceiptInput["paymentMethod"];
  lotteryCode: string | null;
  globalDiscount?: number;
}): string {
  const canonical = JSON.stringify({
    paymentMethod: input.paymentMethod,
    lotteryCode: input.lotteryCode ?? null,
    ...(input.globalDiscount ? { globalDiscount: input.globalDiscount } : {}),
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      grossUnitPrice: line.grossUnitPrice,
      vatCode: line.vatCode,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
