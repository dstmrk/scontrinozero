"use server";

import { logger } from "@/lib/logger";
import { RateLimiter } from "@/lib/rate-limit";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { voidReceiptForBusiness } from "@/lib/services/void-service";
import type { VoidReceiptInput, VoidReceiptResult } from "@/types/storico";

// Rate limit: 10 voids per hour per user (voiding should be rare and deliberate)
const voidLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

export async function voidReceipt(
  input: VoidReceiptInput,
): Promise<VoidReceiptResult> {
  const user = await getAuthenticatedUser();

  const rateLimitResult = voidLimiter.check(`void:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Receipt void rate limit exceeded");
    return { error: "Troppi annulli effettuati. Riprova tra qualche minuto." };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  return voidReceiptForBusiness(input);
}
