import { z } from "zod/v4";
import { RateLimiter } from "@/lib/rate-limit";
import { voidReceiptForBusiness } from "@/lib/services/void-service";
import { isValidUuid } from "@/lib/uuid";
import {
  newRequestId,
  v1Error,
  v1Json,
  v1NoContent,
} from "@/lib/api-v1-errors";
import {
  requireBusinessApiAuth,
  checkRateLimitApi,
  parseAndValidateBody,
  serviceErrorResponse,
  ADE_REAUTH_REQUIRED_MESSAGE,
} from "@/lib/api-v1-helpers";

const voidBodySchema = z.object({
  idempotencyKey: z.string().uuid(),
});

// Rate limit: 20 voids per hour per API key
const voidApiLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
});

export function OPTIONS(): Response {
  return v1NoContent("POST, OPTIONS", newRequestId());
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = newRequestId();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireBusinessApiAuth(request, requestId);
  if ("error" in authResult) return authResult.error;
  const { context: auth } = authResult;

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitError = checkRateLimitApi(
    voidApiLimiter,
    `api:void:${auth.apiKey.id}`,
    auth.apiKey.id,
    "API receipt void rate limit exceeded",
    requestId,
  );
  if (rateLimitError) return rateLimitError;

  // ── Parse body ────────────────────────────────────────────────────────────
  // 8 KB is generous for a void body (only idempotencyKey UUID needed).
  const bodyResult = await parseAndValidateBody(
    request,
    voidBodySchema,
    8 * 1024,
    requestId,
  );
  if ("error" in bodyResult) return bodyResult.error;

  const { idempotencyKey } = bodyResult.data;
  const { id: documentId } = await params;

  if (!isValidUuid(documentId)) {
    return v1Error("INVALID_ID", "ID non valido.", requestId);
  }

  // ── Void ──────────────────────────────────────────────────────────────────
  const result = await voidReceiptForBusiness(
    { documentId, idempotencyKey, businessId: auth.businessId },
    auth.apiKey.id,
  );

  if (result.reauthRequired) {
    // Vedi POST /v1/receipts: 409 + code machine-readable, retry umano.
    return v1Error(
      "ADE_REAUTH_REQUIRED",
      ADE_REAUTH_REQUIRED_MESSAGE,
      requestId,
    );
  }

  if (result.error) {
    return serviceErrorResponse(
      { error: result.error, code: result.code },
      requestId,
    );
  }

  return v1Json(
    {
      voidDocumentId: result.voidDocumentId,
      adeTransactionId: result.adeTransactionId,
      adeProgressive: result.adeProgressive,
    },
    requestId,
  );
}
