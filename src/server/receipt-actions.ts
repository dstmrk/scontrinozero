"use server";

import { logger } from "@/lib/logger";
import { RateLimiter } from "@/lib/rate-limit";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import type { SubmitReceiptInput, SubmitReceiptResult } from "@/types/cassa";

// Rate limit: 30 receipts per hour per user (per-user key, not per-IP)
const receiptLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
});

export async function emitReceipt(
  input: SubmitReceiptInput,
): Promise<SubmitReceiptResult> {
  const user = await getAuthenticatedUser();

  const rateLimitResult = receiptLimiter.check(`emit:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Receipt emit rate limit exceeded");
    return { error: "Troppi scontrini emessi. Riprova tra qualche minuto." };
  }

  if (!input.businessId) {
    return { error: "Business ID mancante." };
  }
  if (input.lines.length === 0) {
    return { error: "Lo scontrino deve contenere almeno un articolo." };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  return emitReceiptForBusiness(input);
}
