import { and, asc, eq } from "drizzle-orm";
import { commercialDocuments, commercialDocumentLines } from "@/db/schema";
import { dbTimeoutResponse, isStatementTimeoutError } from "@/lib/api-errors";
import { withStatementTimeout } from "@/lib/db-timeout";
import { isValidUuid } from "@/lib/uuid";
import { logger } from "@/lib/logger";
import {
  requireBusinessApiAuth,
  corsOptionsResponse,
  withCors,
} from "@/lib/api-v1-helpers";
import { calcDocTotal } from "@/lib/receipts/document-lines";

// Single-doc read: 2 indexed SELECT, atteso < 50ms p99. 3s di budget cattura
// solo gli stalli reali (DB sovraccarico, lock attesi) senza falsi positivi.
const STATEMENT_TIMEOUT_MS = 3000;
const ROUTE = "GET /api/v1/receipts/[id]";

export function OPTIONS(): Response {
  return corsOptionsResponse("GET, OPTIONS");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireBusinessApiAuth(request);
  if ("error" in authResult) return authResult.error;
  const { context: auth } = authResult;

  const { id } = await params;

  if (!isValidUuid(id)) {
    return withCors(
      Response.json({ error: "ID non valido." }, { status: 400 }),
    );
  }

  let result;
  try {
    result = await withStatementTimeout(STATEMENT_TIMEOUT_MS, async (tx) => {
      const [doc] = await tx
        .select({
          id: commercialDocuments.id,
          kind: commercialDocuments.kind,
          status: commercialDocuments.status,
          idempotencyKey: commercialDocuments.idempotencyKey,
          adeTransactionId: commercialDocuments.adeTransactionId,
          adeProgressive: commercialDocuments.adeProgressive,
          createdAt: commercialDocuments.createdAt,
          lotteryCode: commercialDocuments.lotteryCode,
          voidedDocumentId: commercialDocuments.voidedDocumentId,
          publicRequest: commercialDocuments.publicRequest,
        })
        .from(commercialDocuments)
        .where(
          and(
            eq(commercialDocuments.id, id),
            eq(commercialDocuments.businessId, auth.businessId),
          ),
        )
        .limit(1);

      if (!doc) return null;

      const lines = await tx
        .select()
        .from(commercialDocumentLines)
        .where(eq(commercialDocumentLines.documentId, doc.id))
        .orderBy(asc(commercialDocumentLines.lineIndex));

      return { doc, lines };
    });
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { err, path: ROUTE, statusCode: 503 },
        "DB statement timeout",
      );
      return withCors(dbTimeoutResponse());
    }
    throw err;
  }

  if (!result) {
    return withCors(
      Response.json({ error: "Documento non trovato." }, { status: 404 }),
    );
  }

  const { doc, lines } = result;

  const total = calcDocTotal(lines);

  const pr = doc.publicRequest as { paymentMethod?: string } | null;

  return withCors(
    Response.json({
      id: doc.id,
      kind: doc.kind,
      status: doc.status,
      idempotencyKey: doc.idempotencyKey,
      adeTransactionId: doc.adeTransactionId,
      adeProgressive: doc.adeProgressive,
      createdAt: doc.createdAt,
      paymentMethod: pr?.paymentMethod ?? null,
      lotteryCode: doc.lotteryCode,
      voidedDocumentId: doc.voidedDocumentId,
      total: total.toFixed(2),
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        grossUnitPrice: l.grossUnitPrice,
        vatCode: l.vatCode,
      })),
    }),
  );
}
