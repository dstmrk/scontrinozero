import { z } from "zod/v4";
import { RateLimiter } from "@/lib/rate-limit";
import { voidReceiptForBusiness } from "@/lib/services/void-service";
import { isValidUuid } from "@/lib/uuid";
import {
  requireBusinessApiAuth,
  corsOptionsResponse,
  checkRateLimitApi,
  parseAndValidateBody,
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
    return Response.json({ error: "ID non valido." }, { status: 400 });
  }

  // ── Void ──────────────────────────────────────────────────────────────────
  const result = await voidReceiptForBusiness(
    { documentId, idempotencyKey, businessId: auth.businessId },
    auth.apiKey.id,
  );

  if (result.error) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json(
    {
      voidDocumentId: result.voidDocumentId,
      adeTransactionId: result.adeTransactionId,
      adeProgressive: result.adeProgressive,
    },
    { status: 200 },
  );
}
