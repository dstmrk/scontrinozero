"use server";

import { z } from "zod/v4";
import { logger } from "@/lib/logger";
import { getPlanSafe, canEmit, TRIAL_EXPIRED_MESSAGE } from "@/lib/plans";
import {
  discountGateError,
  mixedPaymentGateError,
} from "@/lib/receipts/pro-feature-gates";
import { RateLimiter } from "@/lib/rate-limit";
import {
  SALE_LINES_MAX,
  SALE_LINES_MIN,
  globalDiscountSchema,
  idempotencyKeySchema,
  lotteryCodeSchema,
  paymentMethodSchema,
  paymentsSchema,
  refineSaleBody,
  saleLineSchema,
} from "@/lib/receipts/receipt-schema";
import {
  getAuthenticatedUser,
  checkBusinessOwnership,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import type { SubmitReceiptInput, SubmitReceiptResult } from "@/types/cassa";

// Runtime validation schema — riusa lo schema SALE condiviso (receipt-schema.ts)
// e aggiunge solo i bit consumer-specifici: `id` (chiave React UI-only sulla
// riga) e `businessId`. Enforce le stesse regole fiscali della API v1 anche sul
// canale server action, così un client manomesso non può bypassarle.
const submitLineSchema = saleLineSchema.extend({ id: z.string() });

const submitReceiptSchema = z
  .object({
    businessId: z.string().uuid("Business ID non valido."),
    lines: z.array(submitLineSchema).min(SALE_LINES_MIN).max(SALE_LINES_MAX),
    // Mutuamente esclusivi, esattamente uno dei due: lo impone `refineSaleBody`.
    paymentMethod: paymentMethodSchema.optional(),
    payments: paymentsSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
    lotteryCode: lotteryCodeSchema,
    globalDiscount: globalDiscountSchema,
  })
  .superRefine(refineSaleBody);

// Rate limit: 120 receipts per hour per user (per-user key, not per-IP).
// Allineato a POST /api/v1/receipts: lo stesso account non può avere un tetto
// più basso dalla cassa che dalla Developer API (REVIEW.md #72). La soglia serve
// come guardia anti-loop — ogni submit costa un round-trip AdE — non come
// throttling di business: un bar nel picco pranzo supera 30/ora senza sforzo e
// veniva bloccato sul core flow (blocco operativo/fiscale su utente legittimo).
const receiptLimiter = new RateLimiter({
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
});

export async function emitReceipt(
  input: SubmitReceiptInput,
): Promise<SubmitReceiptResult> {
  // Sessione assente (scaduta col carrello aperto) → degrada a { error }
  // inline invece di propagare all'error boundary di Next (regola 19) e di
  // finire in Sentry come issue (regola 20). Stesso pattern delle altre server
  // action UI-facing (catalog/export/account/billing/analytics).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "emitReceipt");
  }

  const rateLimitResult = receiptLimiter.check(`emit:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Receipt emit rate limit exceeded");
    return { error: "Troppi scontrini emessi. Riprova tra qualche minuto." };
  }

  // Enforce plan/trial gate server-side before any business logic.
  // getPlanSafe e non getPlan: su profilo orfano o DB sovraccarico l'errore
  // degrada a { error } inline invece di sostituire la cassa con l'error
  // boundary di Next (regola 19) — è il core flow fiscale.
  const planResult = await getPlanSafe(user.id, "emitReceipt");
  if (!planResult.ok) return { error: planResult.error };
  const planInfo = planResult.info;
  if (
    !canEmit(planInfo.plan, planInfo.trialStartedAt, planInfo.planExpiresAt)
  ) {
    return { error: TRIAL_EXPIRED_MESSAGE };
  }

  // Runtime validation — same fiscal rules as API v1, applied to every
  // channel including the server action so a tampered client cannot bypass them
  const validation = submitReceiptSchema.safeParse(input);
  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Input non valido.",
    };
  }

  // Gate Pro sugli sconti (stesso predicato della Developer API): un piano
  // insufficiente è un errore, non uno sconto silenziosamente ignorato — vedi
  // `discountGateError`.
  const discountError = discountGateError(planInfo, input);
  if (discountError) return { error: discountError };

  // Stesso principio per il pagamento misto: collassarlo su una modalità sola
  // produrrebbe un documento fiscale irreversibile diverso da quello chiesto.
  const mixedPaymentError = mixedPaymentGateError(planInfo, input);
  if (mixedPaymentError) return { error: mixedPaymentError };

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  return emitReceiptForBusiness(input);
}
