import { z } from "zod/v4";
import { RateLimiter } from "@/lib/rate-limit";
import { authenticateApiKey, isApiKeyAuthError } from "@/lib/api-auth";
import { canUseApi } from "@/lib/plans";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import { logger } from "@/lib/logger";
import { readJsonWithLimit } from "@/lib/request-utils";
import type { SubmitReceiptInput } from "@/types/cassa";

const receiptBodySchema = z.object({
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(200),
        // max 3 decimal places — matches DB column numeric(10,3).
        // parseFloat(toFixed(3)) === v: roundtrips cleanly through string
        // representation and handles IEEE-754 FP edge cases correctly.
        quantity: z
          .number()
          .positive()
          .max(9999)
          .refine((v) => parseFloat(v.toFixed(3)) === v, "max 3 decimali"),
        // max 2 decimal places — matches DB column numeric(10,2).
        grossUnitPrice: z
          .number()
          .nonnegative()
          .max(999_999.99)
          .refine((v) => parseFloat(v.toFixed(2)) === v, "max 2 decimali"),
        vatCode: z.enum([
          "4",
          "5",
          "10",
          "22",
          "N1",
          "N2",
          "N3",
          "N4",
          "N5",
          "N6",
        ]),
      }),
    )
    .min(1)
    .max(100),
  paymentMethod: z.enum(["PC", "PE"]),
  idempotencyKey: z.string().uuid(),
  lotteryCode: z.string().max(8).nullable().optional(),
});

// Rate limit: 120 receipts per hour per API key
const receiptApiLimiter = new RateLimiter({
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
});

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*", // NOSONAR — developer API: auth via Bearer token (not cookies), wildcard is intentional
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

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
  // 32 KB covers even 100-line receipts with room to spare; rejects oversized
  // payloads before JSON.parse to prevent memory/CPU pressure (DoS guard).
  const bodyResult = await readJsonWithLimit(request, 32 * 1024);
  if (!bodyResult.ok) {
    return "tooLarge" in bodyResult
      ? Response.json({ error: "Payload troppo grande." }, { status: 413 })
      : Response.json({ error: "Body non valido." }, { status: 400 });
  }
  const rawBody = bodyResult.data;

  const parsed = receiptBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.join(".");
    const msg = field
      ? `Il campo '${field}' non è valido: ${issue.message}`
      : (issue?.message ?? "Input non valido.");
    return Response.json({ error: msg }, { status: 400 });
  }

  const { lines, paymentMethod, idempotencyKey, lotteryCode } = parsed.data;

  const input: SubmitReceiptInput = {
    businessId: auth.businessId,
    // `id` is a UI-only React key not used by the service layer; omitted from API schema
    lines: lines.map((l) => ({ ...l, id: "" })),
    paymentMethod,
    idempotencyKey,
    lotteryCode: lotteryCode ?? null,
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
