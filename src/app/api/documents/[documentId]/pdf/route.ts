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
import { printableDocumentCondition } from "@/lib/receipts/printable-document";
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
  request: Request,
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
              // Un PDF dall'aspetto fiscale non deve essere generato per
              // documenti PENDING/REJECTED, né per documenti privi di
              // identificativo fiscale (adeTransactionId). La regola su
              // (kind, status) è bidimensionale — una vendita annullata non è
              // più stampabile, il suo annullo sì — e vive tutta in
              // printable-document.ts, condivisa con fetchPublicReceipt
              // (REVIEW.md #7).
              printableDocumentCondition(),
              isNotNull(commercialDocuments.adeTransactionId),
            ),
          )
          .limit(1);

        if (rows.length === 0) return null;

        const { doc, biz } = rows[0];

        // Un annullo non ha righe proprie: ristampa quelle della vendita
        // annullata, e ne porta il progressivo per il blocco "Documento di
        // riferimento" della ricevuta di annullamento.
        let voidedSale = null;
        if (doc.kind === "VOID") {
          if (!doc.voidedDocumentId) return null;

          const [sale] = await tx
            .select()
            .from(commercialDocuments)
            .where(eq(commercialDocuments.id, doc.voidedDocumentId))
            .limit(1);

          if (!sale) return null;
          voidedSale = sale;
        }

        const lines = await tx
          .select()
          .from(commercialDocumentLines)
          .where(
            eq(commercialDocumentLines.documentId, voidedSale?.id ?? doc.id),
          )
          .orderBy(commercialDocumentLines.lineIndex);

        return { doc, biz, lines, voidedSale };
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

  const { doc, biz, lines, voidedSale } = queryResult;

  // TODO(v1.7.0): il layout della ricevuta di annullamento (HAR.md #16a) è in
  // lavorazione a partire dai template ufficiali AdE. Il dato è già tutto qui —
  // `doc` (progressivo e ade_registered_at dell'annullo), `voidedSale`
  // (progressivo di riferimento) e `lines` (righe dell'originale): manca solo
  // il render. Fino ad allora un VOID resta un 400 esplicito invece di
  // ricadere sul layout di vendita, che stamperebbe un annullo come se fosse
  // uno scontrino valido.
  if (voidedSale) {
    return Response.json(
      {
        error:
          "La ricevuta di annullamento non è ancora disponibile per il download.",
      },
      { status: 400 },
    );
  }

  // `?qr=1`: l'esercente decide via `printQr` (preferenze stampante, per
  // dispositivo/localStorage — non leggibile qui) e lo passa come query param
  // da `PrintReceiptButton` quando apre il PDF di fallback.
  const includeQr = new URL(request.url).searchParams.get("qr") === "1";

  return generatePdfResponse({ doc, biz, lines }, { includeQr });
}
