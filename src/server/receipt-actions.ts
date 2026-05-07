"use server";

import { z } from "zod/v4";
import { logger } from "@/lib/logger";
import { getPlan, canEmit } from "@/lib/plans";
import { RateLimiter } from "@/lib/rate-limit";
import { refineLotteryCode } from "@/lib/receipts/lottery-code-schema";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import type { SubmitReceiptInput, SubmitReceiptResult } from "@/types/cassa";

// Runtime validation schema — mirrors the API v1 receiptBodySchema but includes
// the UI-only `id` field present in CartLine. Enforces the same fiscal precision
// rules server-side so a tampered client cannot bypass API-level validation.
const lineSchema = z.object({
  id: z.string(),
  description: z.string().min(1).max(200),
  quantity: z
    .number()
    .positive()
    .max(9999)
    .refine((v) => Number.parseFloat(v.toFixed(3)) === v, "max 3 decimali"),
  grossUnitPrice: z
    .number()
    .nonnegative()
    .max(999_999.99)
    .refine((v) => Number.parseFloat(v.toFixed(2)) === v, "max 2 decimali"),
  vatCode: z.enum(["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"]),
});

const submitReceiptSchema = z
  .object({
    businessId: z.string().min(1, "Business ID obbligatorio."),
    lines: z.array(lineSchema).min(1).max(100),
    paymentMethod: z.enum(["PC", "PE"]),
    idempotencyKey: z.string().uuid(),
    // Format-validated only when paymentMethod === "PE" — see refineLotteryCode.
    lotteryCode: z.string().nullable().optional(),
  })
  .superRefine(refineLotteryCode);

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

  // P0-02: enforce plan/trial gate server-side before any business logic
  const planInfo = await getPlan(user.id);
  if (!canEmit(planInfo.plan, planInfo.trialStartedAt)) {
    return {
      error:
        "Il tuo periodo di prova è scaduto. Attiva un piano per continuare.",
    };
  }

  // P1-03: runtime validation — same fiscal rules as API v1, applied to every
  // channel including the server action so a tampered client cannot bypass them
  const validation = submitReceiptSchema.safeParse(input);
  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Input non valido.",
    };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  return emitReceiptForBusiness(input);
}
