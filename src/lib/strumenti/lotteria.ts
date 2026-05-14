import { LOTTERY_CODE_REGEX } from "@/lib/receipts/lottery-code-schema";

export type LotteryValidationResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export function validateLotteryCode(input: unknown): LotteryValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Inserisci un codice valido." };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Il codice non può essere vuoto." };
  }
  if (trimmed.length !== 8) {
    return {
      ok: false,
      error: "Il codice lotteria deve essere di 8 caratteri.",
    };
  }
  if (!LOTTERY_CODE_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: "Solo lettere maiuscole A-Z e numeri 0-9 sono ammessi.",
    };
  }
  return { ok: true, code: trimmed };
}
