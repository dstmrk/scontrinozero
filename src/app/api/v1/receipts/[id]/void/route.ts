import { z } from "zod/v4";
import { RateLimiter } from "@/lib/rate-limit";
import { voidReceiptForBusiness } from "@/lib/services/void-service";
import { isValidUuid } from "@/lib/uuid";
import {
  requireBusinessApiAuth,
  corsOptionsResponse,
  checkRateLimitApi,
  parseAndValidateBody,
  withCors,
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
  return corsOptionsResponse("POST, OPTIONS");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireBusinessApiAuth(request);
  if ("error" in authResult) return authResult.error;
  const { context: auth } = authResult;

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitError = checkRateLimitApi(
    voidApiLimiter,
    `api:void:${auth.apiKey.id}`,
    auth.apiKey.id,
    "API receipt void rate limit exceeded",
  );
  if (rateLimitError) return rateLimitError;

  // ── Parse body ────────────────────────────────────────────────────────────
  // 8 KB is generous for a void body (only idempotencyKey UUID needed).
  const bodyResult = await parseAndValidateBody(
    request,
    voidBodySchema,
    8 * 1024,
  );
  if ("error" in bodyResult) return bodyResult.error;

  const { idempotencyKey } = bodyResult.data;
  const { id: documentId } = await params;

  if (!isValidUuid(documentId)) {
    return withCors(
      Response.json({ error: "ID non valido." }, { status: 400 }),
    );
  }

  // ── Void ──────────────────────────────────────────────────────────────────
  const result = await voidReceiptForBusiness(
    { documentId, idempotencyKey, businessId: auth.businessId },
    auth.apiKey.id,
  );

  if (result.error) {
    // B20: DB timeout → 503 + Retry-After
    if (result.code === "DB_TIMEOUT") {
      return withCors(
        Response.json(
          { code: "DB_TIMEOUT", error: result.error },
          { status: 503, headers: { "Retry-After": "5" } },
        ),
      );
    }
    // B7: VOID_PENDING_IN_PROGRESS → 409
    if (result.code === "VOID_PENDING_IN_PROGRESS") {
      return withCors(
        Response.json(
          { code: "VOID_PENDING_IN_PROGRESS", error: result.error },
          { status: 409, headers: { "Retry-After": "2" } },
        ),
      );
    }
    // VOID_ALREADY_TARGETED: 409 (race condition)
    if (result.code === "VOID_ALREADY_TARGETED") {
      return withCors(
        Response.json(
          { code: "VOID_ALREADY_TARGETED", error: result.error },
          { status: 409 },
        ),
      );
    }
    // VOID_SYNC_FAILED: 500 + machine-readable code (DB out of sync con AdE,
    // richiede cleanup manuale, non un retry automatico utile)
    if (result.code === "VOID_SYNC_FAILED") {
      return withCors(
        Response.json(
          { code: "VOID_SYNC_FAILED", error: result.error },
          { status: 500 },
        ),
      );
    }
    return withCors(Response.json({ error: result.error }, { status: 422 }));
  }

  return withCors(
    Response.json(
      {
        voidDocumentId: result.voidDocumentId,
        adeTransactionId: result.adeTransactionId,
        adeProgressive: result.adeProgressive,
      },
      { status: 200 },
    ),
  );
}
