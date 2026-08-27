import type { z } from "zod/v4";
import {
  isMixedPayment,
  toPaymentEntries,
  type PaymentInput,
} from "@/lib/receipts/payment-input";

/**
 * Codice Lotteria degli Scontrini: 8 caratteri alfanumerici maiuscoli
 * (specifica AdE). Lo stesso regex è usato da `isValidLotteryCode`.
 */
export const LOTTERY_CODE_REGEX = /^[A-Z0-9]{8}$/;

/**
 * Il documento è pagato **esclusivamente** con mezzi elettronici.
 *
 * È la condizione che l'AdE impone al codice lotteria (`HAR.md` voce #13),
 * insieme alla soglia di 1,00 € che vive nel service: `PE` deve essere
 * l'**unico** slot con importo > 0. Uno slot `PC` a zero non squalifica —
 * non è un incasso — mentre qualunque importo non elettronico sì.
 *
 * ⚠️ Lo sconto a pagare **non** entra nel test, ed è verificato sul portale
 * (voce #13): totale 2,00 €, elettronico 1,00 €, abbuono 1,00 € → codice
 * accettato. "Esclusivamente con mezzi elettronici" descrive com'è composto
 * l'**incassato**, non quanta parte del corrispettivo viene incassata:
 * `scontoAbbuono` non è un mezzo di pagamento. Per questo non si confronta
 * mai l'importo `PE` col totale del documento.
 */
export function isElectronicOnly(data: {
  paymentMethod?: "PC" | "PE";
  payments?: readonly PaymentInput[];
}): boolean {
  if (data.payments) {
    const entries = toPaymentEntries(data.payments);
    return entries?.length === 1 && entries[0].type === "PE";
  }
  return data.paymentMethod === "PE";
}

/**
 * Validatore condizionale per `lotteryCode` da usare in un
 * `z.object().superRefine()`.
 *
 * Due regole diverse a seconda di come è dichiarato il pagamento, e
 * l'asimmetria è voluta:
 *
 * - **`paymentMethod` scalare `PC`** → il codice si accetta e il service lo
 *   ignora (`resolveLotteryCode`). Il check resta permissivo per non rompere
 *   i client legacy che inviano un placeholder: è un comportamento tollerato
 *   da prima, e irrigidirlo ora romperebbe integrazioni che funzionano.
 * - **`payments[]`** → un codice non trasmissibile è un **errore**. Il
 *   pagamento ripartito non ha client legacy: nessuno può aver preso
 *   l'abitudine di mandarci un placeholder. Accettarlo in silenzio farebbe
 *   credere all'integratore che il codice sia finito su un documento fiscale
 *   irreversibile, quando non ci finirà mai.
 *
 * Il formato si valida solo quando il codice è davvero trasmissibile: su un
 * pagamento che lo squalifica il valore non arriva mai all'AdE, e segnalare
 * "8 caratteri" invece della vera ragione manderebbe a caccia del bug
 * sbagliato.
 *
 * Condiviso fra `POST /api/v1/receipts` e la server action `emitReceipt`.
 */
export function refineLotteryCode(
  data: {
    paymentMethod?: "PC" | "PE";
    payments?: readonly PaymentInput[];
    lotteryCode?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.lotteryCode == null) return;

  if (isMixedPayment(data.payments)) {
    ctx.addIssue({
      code: "custom",
      path: ["lotteryCode"],
      message:
        "Il codice lotteria richiede un pagamento solo elettronico: non è ammesso sui pagamenti misti.",
    });
    return;
  }

  if (!isElectronicOnly(data)) return;

  if (!LOTTERY_CODE_REGEX.test(data.lotteryCode)) {
    ctx.addIssue({
      code: "custom",
      path: ["lotteryCode"],
      message: "Codice lotteria non valido (8 caratteri [A-Z0-9]).",
    });
  }
}
