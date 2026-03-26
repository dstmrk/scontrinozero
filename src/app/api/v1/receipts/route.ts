import { RateLimiter } from "@/lib/rate-limit";
import { authenticateApiKey, isApiKeyAuthError } from "@/lib/api-auth";
import { canUseApi } from "@/lib/plans";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import { logger } from "@/lib/logger";
import type { SubmitReceiptInput } from "@/types/cassa";

// Rate limit: 120 receipts per hour per API key
const receiptApiLimiter = new RateLimiter({
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
});

export async function POST(request: Request): Promise<Response> {
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
          "Questa API richiede una business key (szk_live_). Le management key non possono emettere scontrini.",
      },
      { status: 403 },
    );
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitResult = receiptApiLimiter.check(`api:emit:${auth.apiKey.id}`);
  if (!rateLimitResult.success) {
    logger.warn(
      { apiKeyId: auth.apiKey.id },
      "API receipt emit rate limit exceeded",
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

  const { lines, paymentMethod, idempotencyKey, lotteryCode } =
    body as Partial<SubmitReceiptInput>;

  if (!Array.isArray(lines) || lines.length === 0) {
    return Response.json(
      { error: "Il campo 'lines' è obbligatorio e non può essere vuoto." },
      { status: 400 },
    );
  }
  if (paymentMethod !== "PC" && paymentMethod !== "PE") {
    return Response.json(
      { error: "Il campo 'paymentMethod' deve essere 'PC' o 'PE'." },
      { status: 400 },
    );
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    return Response.json(
      { error: "Il campo 'idempotencyKey' è obbligatorio." },
      { status: 400 },
    );
  }

  const input: SubmitReceiptInput = {
    businessId: auth.businessId,
    lines,
    paymentMethod,
    idempotencyKey,
    lotteryCode: typeof lotteryCode === "string" ? lotteryCode : null,
  };

  // ── Emit ──────────────────────────────────────────────────────────────────
  const result = await emitReceiptForBusiness(input, auth.apiKey.id);

  if (result.error) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json(
    {
      documentId: result.documentId,
      adeTransactionId: result.adeTransactionId,
      adeProgressive: result.adeProgressive,
    },
    { status: 201 },
  );
}
