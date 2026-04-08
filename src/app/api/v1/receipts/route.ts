import { z } from "zod/v4";
import { RateLimiter } from "@/lib/rate-limit";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import {
  requireBusinessApiAuth,
  corsOptionsResponse,
  checkRateLimitApi,
  parseAndValidateBody,
} from "@/lib/api-v1-helpers";
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
          .refine(
            (v) => Number.parseFloat(v.toFixed(3)) === v,
            "max 3 decimali",
          ),
        // max 2 decimal places — matches DB column numeric(10,2).
        grossUnitPrice: z
          .number()
          .nonnegative()
          .max(999_999.99)
          .refine(
            (v) => Number.parseFloat(v.toFixed(2)) === v,
            "max 2 decimali",
          ),
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
  return corsOptionsResponse("POST, OPTIONS");
}

export async function POST(request: Request): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireBusinessApiAuth(request);
  if ("error" in authResult) return authResult.error;
  const { context: auth } = authResult;

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitError = checkRateLimitApi(
    receiptApiLimiter,
    `api:emit:${auth.apiKey.id}`,
    auth.apiKey.id,
    "API receipt emit rate limit exceeded",
  );
  if (rateLimitError) return rateLimitError;

  // ── Parse body ────────────────────────────────────────────────────────────
  // 32 KB covers even 100-line receipts with room to spare; rejects oversized
  // payloads before JSON.parse to prevent memory/CPU pressure (DoS guard).
  const bodyResult = await parseAndValidateBody(
    request,
    receiptBodySchema,
    32 * 1024,
  );
  if ("error" in bodyResult) return bodyResult.error;

  const { lines, paymentMethod, idempotencyKey, lotteryCode } = bodyResult.data;

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
