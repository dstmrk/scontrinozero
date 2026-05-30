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
 */
export function hashSaleRequest(input: {
  lines: SubmitReceiptInput["lines"];
  paymentMethod: SubmitReceiptInput["paymentMethod"];
  lotteryCode: string | null;
}): string {
  const canonical = JSON.stringify({
    paymentMethod: input.paymentMethod,
    lotteryCode: input.lotteryCode ?? null,
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      grossUnitPrice: line.grossUnitPrice,
      vatCode: line.vatCode,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
