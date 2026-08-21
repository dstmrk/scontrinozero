import { parsePublicRequest } from "@/lib/receipts/public-request";
import { and, asc, eq } from "drizzle-orm";
import { commercialDocuments, commercialDocumentLines } from "@/db/schema";
import { isStatementTimeoutError } from "@/lib/api-errors";
import {
  newRequestId,
  v1Error,
  v1Json,
  v1NoContent,
} from "@/lib/api-v1-errors";
import { withStatementTimeout } from "@/lib/db-timeout";
import { isValidUuid } from "@/lib/uuid";
import { logger } from "@/lib/logger";
import { requireBusinessApiAuth } from "@/lib/api-v1-helpers";
import { calcDocTotal } from "@/lib/receipts/document-lines";

// Single-doc read: 2 indexed SELECT, atteso < 50ms p99. 3s di budget cattura
// solo gli stalli reali (DB sovraccarico, lock attesi) senza falsi positivi.
const STATEMENT_TIMEOUT_MS = 3000;
const ROUTE = "GET /api/v1/receipts/[id]";

export function OPTIONS(): Response {
  return v1NoContent("GET, OPTIONS", newRequestId());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = newRequestId();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireBusinessApiAuth(request, requestId);
  if ("error" in authResult) return authResult.error;
  const { context: auth } = authResult;

  const { id } = await params;

  if (!isValidUuid(id)) {
    return v1Error("INVALID_ID", "ID non valido.", requestId);
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
        { err, path: ROUTE, statusCode: 503, requestId },
        "DB statement timeout",
      );
      return v1Error(
        "DB_TIMEOUT",
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
        requestId,
      );
    }
    throw err;
  }

  if (!result) {
    // Not-found cross-tenant: la query filtra per businessId della API key e
    // risponde 404 generico (no IDOR/oracle). Loggare un warn unico (REVIEW
    // #15) dà visibilità sull'enumerazione di UUID altrui — il rate per
    // apiKeyId è il segnale. warn, non error (input prevedibile, regola 20):
    // niente issue Sentry, query canonica `errorClass:v1_document_not_found`.
    logger.warn(
      {
        documentId: id,
        businessId: auth.businessId,
        apiKeyId: auth.apiKey.id,
        errorClass: "v1_document_not_found",
        requestId,
      },
      "v1 document not found",
    );
    return v1Error("NOT_FOUND", "Documento non trovato.", requestId);
  }

  const { doc, lines } = result;

  const total = calcDocTotal(lines);

  // ⚠️ `paymentMethod` NON passa da `parsePublicRequest`: il contratto
  // pubblico espone `null` quando il campo manca, mentre l'helper degrada a
  // `"PC"` per la stampa. Cambiarlo qui sarebbe un breaking change v1.
  const pr = doc.publicRequest as { paymentMethod?: string } | null;
  const { globalDiscountCents } = parsePublicRequest(doc.publicRequest);

  return v1Json(
    {
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
      // Sconto a pagare: NON riduce `total`, che resta il corrispettivo
      // (HAR.md voce #3b). L'incassato e' `total - globalDiscount`.
      globalDiscount: (globalDiscountCents / 100).toFixed(2),
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        grossUnitPrice: l.grossUnitPrice,
        lineDiscount: l.lineDiscount,
        vatCode: l.vatCode,
      })),
    },
    requestId,
  );
}
