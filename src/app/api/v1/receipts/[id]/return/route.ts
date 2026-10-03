import { z } from "zod/v4";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { SALE_LINES_MAX } from "@/lib/receipts/receipt-schema";
import { returnReceiptForBusiness } from "@/lib/services/return-service";
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

/**
 * `quantities[i]` = pezzi resi adesso della riga `i` di `lines` in
 * `GET /v1/receipts/{id}` (stesso ordine); `0` = riga non resa.
 *
 * Qui tutto ciò che si vede dal solo corpo → `400 VALIDATION_ERROR`: negativi,
 * più di due decimali (limite del portale AdE), nessun pezzo reso. Ciò che
 * dipende dallo scontrino — numero di righe, residuo letto dall'AdE, che conta
 * anche i resi dal portale — lo valida il servizio → `422
 * RETURN_INVALID_QUANTITIES`. Così lo status dice al client cosa fare:
 * correggere il codice, oppure rileggere lo scontrino.
 */
const returnBodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  quantities: z
    .array(
      z
        .number()
        .finite()
        .nonnegative()
        .max(9999)
        .refine((v) => Number.parseFloat(v.toFixed(2)) === v, "max 2 decimali"),
    )
    .min(1)
    .max(SALE_LINES_MAX)
    .refine((qs) => qs.some((q) => q > 0), "almeno una quantità maggiore di 0"),
});

// 20 resi/ora per API key: stessa soglia di `api:void` e del reso dalla cassa.
const returnApiLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
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
    returnApiLimiter,
    `api:return:${auth.apiKey.id}`,
    auth.apiKey.id,
    "API receipt return rate limit exceeded",
    requestId,
  );
  if (rateLimitError) return rateLimitError;

  // ── Parse body ────────────────────────────────────────────────────────────
  // 8 KB: una key e al massimo 100 numeri.
  const bodyResult = await parseAndValidateBody(
    request,
    returnBodySchema,
    8 * 1024,
    requestId,
  );
  if ("error" in bodyResult) return bodyResult.error;

  const { idempotencyKey, quantities } = bodyResult.data;
  const { id: documentId } = await params;

  if (!isValidUuid(documentId)) {
    return v1Error("INVALID_ID", "ID non valido.", requestId);
  }

  // ── Return ────────────────────────────────────────────────────────────────
  const result = await returnReceiptForBusiness(
    { documentId, idempotencyKey, businessId: auth.businessId, quantities },
    auth.apiKey.id,
  );

  if (result.reauthRequired) {
    return v1Error(
      "ADE_REAUTH_REQUIRED",
      ADE_REAUTH_REQUIRED_MESSAGE,
      requestId,
    );
  }

  if (result.error) {
    // `returnDocumentId` → `documentId` dell'envelope, come sull'annullo: il
    // servizio lo valorizza solo sugli esiti ancora aperti (reso in volo,
    // AdE muta) e sulla sync fallita, cioè quando c'è una riga da seguire.
    return serviceErrorResponse(
      {
        error: result.error,
        code: result.code,
        documentId: result.returnDocumentId,
      },
      requestId,
    );
  }

  return v1Json(
    {
      returnDocumentId: result.returnDocumentId,
      adeTransactionId: result.adeTransactionId,
      adeProgressive: result.adeProgressive,
    },
    requestId,
  );
}
