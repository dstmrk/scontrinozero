"use server";

import { z } from "zod/v4";
import { logger } from "@/lib/logger";
import { getPlanSafe, canEmit, TRIAL_EXPIRED_MESSAGE } from "@/lib/plans";
import { RateLimiter } from "@/lib/rate-limit";
import {
  checkBusinessMembership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import {
  canAccessDocument,
  collaboratorSuspendedError,
} from "@/lib/business-permissions";
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
  // so it follows the same canEmit policy as receipt creation.
  // getPlanSafe: degrada a { error } inline come emitReceipt (regola 19).
  const planResult = await getPlanSafe(user.id, "voidReceipt");
  if (!planResult.ok) return { error: planResult.error };
  const planInfo = planResult.info;
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

  const membership = await checkBusinessMembership(user.id, input.businessId);
  if ("error" in membership) return membership;

  // Un collaboratore opera solo finché il piano del titolare lo ammette
  // (issue #1099): sceso a Pro, resta membro ma non annulla.
  const suspended = collaboratorSuspendedError(membership, planInfo);
  if (suspended) return { error: suspended };

  // Il collaboratore annulla solo i documenti che ha emesso (decisione 2
  // sulla issue). Un documento altrui risponde come uno inesistente.
  if (
    !(await canAccessDocument(
      membership,
      validation.data.businessId,
      validation.data.documentId,
    ))
  ) {
    return { error: "Scontrino non trovato.", code: "NOT_FOUND" };
  }

  // Il valore validato, non l'oggetto grezzo del client: ciò che è stato
  // controllato e ciò che il servizio usa devono essere la stessa cosa.
  // Il membro che opera firma il documento (`created_by`, issue #1099).
  return voidReceiptForBusiness(validation.data, {
    memberId: membership.memberId,
  });
}
