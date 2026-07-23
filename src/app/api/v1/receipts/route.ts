import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { commercialDocuments } from "@/db/schema";
import {
  fetchLinesByDocIds,
  groupLinesByDocId,
  calcDocTotal,
} from "@/lib/receipts/document-lines";
import { saleBodySchema } from "@/lib/receipts/receipt-schema";
import { parseStrictIsoDateUtc } from "@/lib/date-utils";
import { dbTimeoutResponse, isStatementTimeoutError } from "@/lib/api-errors";
import { withStatementTimeout } from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { RateLimiter } from "@/lib/rate-limit";
import { emitReceiptForBusiness } from "@/lib/services/receipt-service";
import {
  requireBusinessApiAuth,
  corsOptionsResponse,
  checkRateLimitApi,
  parseAndValidateBody,
  parseListPagination,
  serviceErrorResponse,
  withCors,
  ADE_REAUTH_REQUIRED_MESSAGE,
} from "@/lib/api-v1-helpers";
import type { SubmitReceiptInput } from "@/types/cassa";

// Schema corpo SALE: condiviso con la server action `emitReceipt` via
// `saleBodySchema` (src/lib/receipts/receipt-schema.ts). Unica fonte di verità
// dei limiti di precisione fiscale e dei vincoli del corpo scontrino.

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

// list query: count + select fino a 100 doc + lines fetch su quel batch.
// 5s di budget tiene il p95 anche su un page=100 con catalogo grande, e
// taglia gli stalli prima che il client web dia "richiesta non risponde".
const LIST_TIMEOUT_MS = 5000;
const LIST_ROUTE = "GET /api/v1/receipts";

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
    saleBodySchema,
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

  if (result.reauthRequired) {
    // Sessione AdE interattiva (CIE) scaduta: richiede un ri-collegamento
    // dall'app web (secondo fattore umano), non automatizzabile via API.
    // 409 + code machine-readable così il client distingue "azione umana"
    // dagli altri 409 retryable (PENDING_IN_PROGRESS, ecc.).
    return serviceErrorResponse({
      error: ADE_REAUTH_REQUIRED_MESSAGE,
      code: "ADE_REAUTH_REQUIRED",
    });
  }

  if (result.error) {
    return serviceErrorResponse({ error: result.error, code: result.code });
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

  // Optional params: page/limit/kind validati al boundary (regola 9). Valori
  // invalidi → 400 esplicito, niente clamp/ignore silenzioso.
  const paginationResult = parseListPagination(searchParams);
  if ("error" in paginationResult) return paginationResult.error;
  const { page, limit, kind } = paginationResult.data;
  const offset = (page - 1) * limit;

  // ── DB queries ────────────────────────────────────────────────────────────
  const conditions = [
    eq(commercialDocuments.businessId, auth.businessId),
    gte(commercialDocuments.createdAt, fromDate),
    lt(commercialDocuments.createdAt, toDateExclusive),
    inArray(commercialDocuments.status, ["ACCEPTED", "VOID_ACCEPTED"]),
  ];
  if (kind) {
    conditions.push(eq(commercialDocuments.kind, kind));
  }

  let queryResult: {
    total: number;
    docs: Array<{
      id: string;
      kind: "SALE" | "VOID";
      status: string;
      idempotencyKey: string;
      adeTransactionId: string | null;
      adeProgressive: string | null;
      lotteryCode: string | null;
      publicRequest: unknown;
      createdAt: Date;
    }>;
    lines: Awaited<ReturnType<typeof fetchLinesByDocIds>>;
  };
  try {
    queryResult = await withStatementTimeout(LIST_TIMEOUT_MS, async (tx) => {
      // count e select dei documenti sono indipendenti (stesse condizioni,
      // nessuna data-dependency) → in parallelo.
      const [[{ value: total }], docs] = await Promise.all([
        tx
          .select({ value: count() })
          .from(commercialDocuments)
          .where(and(...conditions)),
        tx
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
          .orderBy(
            desc(commercialDocuments.createdAt),
            desc(commercialDocuments.id),
          )
          .limit(limit)
          .offset(offset),
      ]);

      if (docs.length === 0) return { total, docs, lines: [] };

      const lines = await fetchLinesByDocIds(
        docs.map((d) => d.id),
        tx,
      );
      return { total, docs, lines };
    });
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { err, path: LIST_ROUTE, statusCode: 503 },
        "DB statement timeout",
      );
      return withCors(dbTimeoutResponse());
    }
    throw err;
  }

  const { total, docs, lines } = queryResult;

  if (docs.length === 0) {
    return withCors(
      Response.json({
        data: [],
        pagination: { page, limit, total, hasNextPage: page * limit < total },
      }),
    );
  }

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
