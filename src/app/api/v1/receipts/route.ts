import { z } from "zod/v4";
import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import {
  fetchLinesByDocIds,
  groupLinesByDocId,
  calcDocTotal,
} from "@/lib/receipts/document-lines";
import { parseStrictIsoDateUtc } from "@/lib/date-utils";
import { RateLimiter } from "@/lib/rate-limit";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import {
  requireBusinessApiAuth,
  corsOptionsResponse,
  checkRateLimitApi,
  parseAndValidateBody,
  withCors,
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
  // 8 uppercase alphanumeric chars per AdE Lotteria degli Scontrini spec.
  // Same regex used in `src/lib/ade/validation.ts` and `isValidLotteryCode`.
  // The service layer rejects invalid codes with 422; validating at the API
  // boundary returns 400 with a clearer error and avoids hitting the service.
  lotteryCode: z
    .string()
    .regex(
      /^[A-Z0-9]{8}$/,
      "Codice lotteria non valido (8 caratteri [A-Z0-9]).",
    )
    .nullable()
    .optional(),
});

// Rate limit: 120 receipts per hour per API key
const receiptApiLimiter = new RateLimiter({
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
});

// Rate limit: 60 list requests per hour per API key (read but potentially heavy)
const listApiLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
});

const MAX_RANGE_DAYS = 31;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function OPTIONS(): Response {
  return corsOptionsResponse("GET, POST, OPTIONS");
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
    return withCors(Response.json({ error: result.error }, { status: 422 }));
  }

  return withCors(
    Response.json(
      {
        documentId: result.documentId,
        adeTransactionId: result.adeTransactionId,
        adeProgressive: result.adeProgressive,
      },
      { status: 201 },
    ),
  );
}

export async function GET(request: Request): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireBusinessApiAuth(request);
  if ("error" in authResult) return authResult.error;
  const { context: auth } = authResult;

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rateLimitError = checkRateLimitApi(
    listApiLimiter,
    `api:list:${auth.apiKey.id}`,
    auth.apiKey.id,
    "API receipt list rate limit exceeded",
  );
  if (rateLimitError) return rateLimitError;

  // ── Query param validation ────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  if (!fromStr) {
    return withCors(
      Response.json(
        {
          error:
            "Il parametro 'from' è obbligatorio e deve essere nel formato YYYY-MM-DD.",
        },
        { status: 400 },
      ),
    );
  }
  const fromDate = parseStrictIsoDateUtc(fromStr);
  if (!fromDate) {
    return withCors(
      Response.json(
        { error: "Il parametro 'from' non è una data valida." },
        { status: 400 },
      ),
    );
  }

  if (!toStr) {
    return withCors(
      Response.json(
        {
          error:
            "Il parametro 'to' è obbligatorio e deve essere nel formato YYYY-MM-DD.",
        },
        { status: 400 },
      ),
    );
  }
  const toDate = parseStrictIsoDateUtc(toStr);
  if (!toDate) {
    return withCors(
      Response.json(
        { error: "Il parametro 'to' non è una data valida." },
        { status: 400 },
      ),
    );
  }

  if (toDate < fromDate) {
    return withCors(
      Response.json(
        { error: "Il parametro 'to' non può essere precedente a 'from'." },
        { status: 400 },
      ),
    );
  }

  const diffDays =
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  // +1: both from and to are inclusive days in the range
  if (diffDays + 1 > MAX_RANGE_DAYS) {
    return withCors(
      Response.json(
        {
          error: `L'intervallo massimo consentito è ${MAX_RANGE_DAYS} giorni.`,
        },
        { status: 400 },
      ),
    );
  }

  // Include the entire 'to' day by advancing to the start of the next day
  const toDateExclusive = new Date(toDate);
  toDateExclusive.setUTCDate(toDateExclusive.getUTCDate() + 1);

  // Optional params
  const pageStr = searchParams.get("page");
  const limitStr = searchParams.get("limit");
  const kindStr = searchParams.get("kind");

  const page = Math.max(1, Number.parseInt(pageStr ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      Number.parseInt(limitStr ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    ),
  );
  const offset = (page - 1) * limit;
  const kind: "SALE" | "VOID" | null =
    kindStr === "SALE" || kindStr === "VOID" ? kindStr : null;

  // ── DB queries ────────────────────────────────────────────────────────────
  const db = getDb();

  const conditions = [
    eq(commercialDocuments.businessId, auth.businessId),
    gte(commercialDocuments.createdAt, fromDate),
    lt(commercialDocuments.createdAt, toDateExclusive),
    inArray(commercialDocuments.status, ["ACCEPTED", "VOID_ACCEPTED"]),
  ];
  if (kind) {
    conditions.push(eq(commercialDocuments.kind, kind));
  }

  // Count total matching docs (no pagination)
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(commercialDocuments)
    .where(and(...conditions));

  // Fetch the current page
  const docs = await db
    .select({
      id: commercialDocuments.id,
      kind: commercialDocuments.kind,
      status: commercialDocuments.status,
      idempotencyKey: commercialDocuments.idempotencyKey,
      adeTransactionId: commercialDocuments.adeTransactionId,
      adeProgressive: commercialDocuments.adeProgressive,
      lotteryCode: commercialDocuments.lotteryCode,
      publicRequest: commercialDocuments.publicRequest,
      createdAt: commercialDocuments.createdAt,
    })
    .from(commercialDocuments)
    .where(and(...conditions))
    .orderBy(desc(commercialDocuments.createdAt))
    .limit(limit)
    .offset(offset);

  if (docs.length === 0) {
    return withCors(
      Response.json({
        data: [],
        pagination: { page, limit, total, hasNextPage: page * limit < total },
      }),
    );
  }

  // Fetch lines for total calculation (not included in response)
  const docIds = docs.map((d) => d.id);
  const lines = await fetchLinesByDocIds(docIds);
  const linesByDocId = groupLinesByDocId(lines);

  const data = docs.map((doc) => {
    const docLines = linesByDocId.get(doc.id) ?? [];
    const docTotal = calcDocTotal(docLines);

    const pr = doc.publicRequest as { paymentMethod?: string } | null;

    return {
      id: doc.id,
      idempotencyKey: doc.idempotencyKey,
      kind: doc.kind,
      status: doc.status,
      adeTransactionId: doc.adeTransactionId,
      adeProgressive: doc.adeProgressive,
      lotteryCode: doc.lotteryCode,
      paymentMethod: pr?.paymentMethod ?? null,
      total: docTotal.toFixed(2),
      createdAt: doc.createdAt,
    };
  });

  return withCors(
    Response.json({
      data,
      pagination: {
        page,
        limit,
        total,
        hasNextPage: page * limit < total,
      },
    }),
  );
}
