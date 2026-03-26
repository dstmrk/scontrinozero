import { RateLimiter } from "@/lib/rate-limit";
import { authenticateApiKey, isApiKeyAuthError } from "@/lib/api-auth";
import { canUseApi } from "@/lib/plans";
import { voidReceiptForBusiness } from "@/lib/services/void-service";
import { logger } from "@/lib/logger";

// Rate limit: 20 voids per hour per API key
const voidApiLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await authenticateApiKey(request);
  if (isApiKeyAuthError(auth)) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // ── Plan gate ─────────────────────────────────────────────────────────────
  if (!canUseApi(auth.plan)) {
    return Response.json(
      {
        error:
          "Il tuo piano non include l'accesso alle API. Passa al piano Pro o Developer.",
      },
      { status: 402 },
    );
  }

  // ── Business key required ─────────────────────────────────────────────────
  if (!auth.businessId) {
    return Response.json(
      {
        error:
          "Questa API richiede una business key (szk_live_). Le management key non possono annullare scontrini.",
      },
      { status: 403 },
    );
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitResult = voidApiLimiter.check(`api:void:${auth.apiKey.id}`);
  if (!rateLimitResult.success) {
    logger.warn(
      { apiKeyId: auth.apiKey.id },
      "API receipt void rate limit exceeded",
    );
    return Response.json(
      { error: "Troppe richieste. Riprova tra qualche ora." },
      { status: 429 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body non valido." }, { status: 400 });
  }

  const { idempotencyKey } = body;
  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    return Response.json(
      { error: "Il campo 'idempotencyKey' è obbligatorio." },
      { status: 400 },
    );
  }

  const { id: documentId } = await params;

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
