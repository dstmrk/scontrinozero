import { eq, and, isNotNull } from "drizzle-orm";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
  profiles,
} from "@/db/schema";
import { dbTimeoutResponse, isStatementTimeoutError } from "@/lib/api-errors";
import { withStatementTimeout } from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { RateLimiter, RATE_LIMIT_WINDOWS } from "@/lib/rate-limit";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { generatePdfResponse } from "@/lib/receipts/generate-pdf-response";
import { isValidUuid } from "@/lib/uuid";

// PDF lookup: 1 JOIN auth + 1 SELECT lines + render in-process. 4s coprono
// anche scontrini con molte righe; il rendering pdfkit è CPU-bound, fuori
// dal budget DB. Su 57014 ritorniamo 503 retryable invece di un PDF rotto.
const STATEMENT_TIMEOUT_MS = 4000;
const ROUTE = "GET /api/documents/[documentId]/pdf";

// Il rendering pdfkit è CPU-bound sul singolo container: un client PWA in
// retry loop può saturarlo. Stessa soglia della gemella pubblica
// (r/[documentId]/pdf, 60/h) ma per-utente autenticato invece che per-IP.
const pdfAuthLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: RATE_LIMIT_WINDOWS.HOURLY,
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // getAuthenticatedUser (non getUser() diretto): bind Sentry.setUser({ id })
  // (regola 22) e touch last_seen_at gratis anche per chi usa l'app solo per
  // scaricare PDF (altrimenti risulterebbe inattivo per il GDPR pruning).
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  if (!pdfAuthLimiter.check(`pdf-auth:${user.id}`).success) {
    logger.warn({ userId: user.id }, "authenticated PDF rate limit exceeded");
    return Response.json(
      { error: ERROR_MESSAGES.RATE_LIMIT_PUBLIC_MINUTES },
      { status: 429 },
    );
  }

  const { documentId } = await params;

  if (!isValidUuid(documentId)) {
    return Response.json({ error: "ID non valido." }, { status: 400 });
  }

  let queryResult;
  try {
    queryResult = await withStatementTimeout(
      STATEMENT_TIMEOUT_MS,
      async (tx) => {
        const rows = await tx
          .select({ doc: commercialDocuments, biz: businesses })
          .from(commercialDocuments)
          .innerJoin(
            businesses,
            eq(commercialDocuments.businessId, businesses.id),
          )
          .innerJoin(profiles, eq(businesses.profileId, profiles.id))
          .where(
            and(
              eq(commercialDocuments.id, documentId),
              eq(profiles.authUserId, user.id),
              // Solo documenti effettivamente accettati da AdE: un PDF dall'aspetto
              // fiscale non deve essere generato per documenti PENDING/REJECTED né
              // per documenti ACCEPTED privi di identificativo fiscale
              // (adeTransactionId). Coerente con fetchPublicReceipt (REVIEW.md #7).
              eq(commercialDocuments.status, "ACCEPTED"),
              isNotNull(commercialDocuments.adeTransactionId),
            ),
          )
          .limit(1);

        if (rows.length === 0) return null;

        const { doc, biz } = rows[0];
        if (doc.kind !== "SALE") return { doc, biz, lines: null };

        const lines = await tx
          .select()
          .from(commercialDocumentLines)
          .where(eq(commercialDocumentLines.documentId, doc.id))
          .orderBy(commercialDocumentLines.lineIndex);

        return { doc, biz, lines };
      },
    );
  } catch (err) {
    if (isStatementTimeoutError(err)) {
      logger.warn(
        { err, path: ROUTE, statusCode: 503 },
        "DB statement timeout",
      );
      return dbTimeoutResponse();
    }
    throw err;
  }

  if (!queryResult) {
    return Response.json({ error: "Documento non trovato." }, { status: 404 });
  }

  const { doc, biz, lines } = queryResult;

  if (lines === null) {
    return Response.json(
      {
        error:
          "Il PDF è disponibile solo per documenti di vendita (kind=SALE).",
      },
      { status: 400 },
    );
  }

  return generatePdfResponse({ doc, biz, lines });
}
