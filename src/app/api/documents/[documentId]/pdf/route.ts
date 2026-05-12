import { eq, and } from "drizzle-orm";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
  profiles,
} from "@/db/schema";
import { dbTimeoutResponse, isStatementTimeoutError } from "@/lib/api-errors";
import { withStatementTimeout } from "@/lib/db-timeout";
import { logger } from "@/lib/logger";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePdfResponse } from "@/lib/receipts/generate-pdf-response";
import { isValidUuid } from "@/lib/uuid";

// PDF lookup: 1 JOIN auth + 1 SELECT lines + render in-process. 4s coprono
// anche scontrini con molte righe; il rendering pdfkit è CPU-bound, fuori
// dal budget DB. Su 57014 ritorniamo 503 retryable invece di un PDF rotto.
const STATEMENT_TIMEOUT_MS = 4000;
const ROUTE = "GET /api/documents/[documentId]/pdf";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
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
