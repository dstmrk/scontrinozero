import type { z } from "zod/v4";

/**
 * Codice Lotteria degli Scontrini: 8 caratteri alfanumerici maiuscoli
 * (specifica AdE). Lo stesso regex è usato da `isValidLotteryCode` e da
 * `src/lib/ade/validation.ts` (lato payload AdE).
 */
export const LOTTERY_CODE_REGEX = /^[A-Z0-9]{8}$/;

/**
 * Validatore condizionale per `lotteryCode` da usare in un `z.object().superRefine()`.
 * Il regex viene applicato solo quando `paymentMethod === "PE"`: la lotteria
 * scontrini si applica esclusivamente ai pagamenti elettronici, e il service
 * layer (`resolveLotteryCode`) ignora il campo per `PC`. Mantenere il check
 * permissivo su PC evita di rompere client legacy che inviano placeholder.
 *
 * Condiviso tra `POST /api/v1/receipts` e la server action `emitReceipt`
 * per evitare duplicazione (SonarCloud Quality Gate ≤3%).
 */
export function refineLotteryCode(
  data: { paymentMethod: "PC" | "PE"; lotteryCode?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (
    data.paymentMethod === "PE" &&
    data.lotteryCode != null &&
    !LOTTERY_CODE_REGEX.test(data.lotteryCode)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["lotteryCode"],
      message: "Codice lotteria non valido (8 caratteri [A-Z0-9]).",
    });
  }
}
