"use server";

import { z } from "zod/v4";
import { logger } from "@/lib/logger";
import { getPlan, canEmit, TRIAL_EXPIRED_MESSAGE } from "@/lib/plans";
import { RateLimiter } from "@/lib/rate-limit";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import { voidReceiptForBusiness } from "@/lib/services/void-service";
import type { VoidReceiptInput, VoidReceiptResult } from "@/types/storico";

// Rate limit: 10 voids per hour per user (voiding should be rare and deliberate)
const voidLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

// Runtime validation — businessId/documentId/idempotencyKey are UUID columns
// in Postgres. Without this guard a tampered client could send a non-UUID and
// trigger a Postgres "invalid input syntax for type uuid" 500 (log noise + a
// light DoS surface) instead of a clean application error.
const voidReceiptSchema = z.object({
  businessId: z.string().uuid("Business ID non valido."),
  documentId: z.string().uuid("Documento non valido."),
  idempotencyKey: z.string().uuid("Chiave di idempotenza non valida."),
});

export async function voidReceipt(
  input: VoidReceiptInput,
): Promise<VoidReceiptResult> {
  // Sessione assente (scaduta con lo storico aperto) → degrada a { error }
  // inline invece di propagare all'error boundary di Next (regola 19) e di
  // finire in Sentry come issue (regola 20). Stesso pattern di emitReceipt.
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "voidReceipt");
  }

  const rateLimitResult = voidLimiter.check(`void:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Receipt void rate limit exceeded");
    return { error: "Troppi annulli effettuati. Riprova tra qualche minuto." };
  }

  // Enforce plan/trial gate server-side — voiding is an emit operation
  // so it follows the same canEmit policy as receipt creation
  const planInfo = await getPlan(user.id);
  if (
    !canEmit(planInfo.plan, planInfo.trialStartedAt, planInfo.planExpiresAt)
  ) {
    return { error: TRIAL_EXPIRED_MESSAGE };
  }

  // Validate UUIDs before any DB query so malformed input returns an
  // application error, not a Postgres uuid-syntax 500.
  const validation = voidReceiptSchema.safeParse(input);
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

  return voidReceiptForBusiness(input);
}
