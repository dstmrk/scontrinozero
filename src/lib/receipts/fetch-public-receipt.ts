import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
} from "@/db/schema";
import type { SelectCommercialDocument } from "@/db/schema/commercial-documents";
import type { SelectBusiness } from "@/db/schema/businesses";
import type { SelectCommercialDocumentLine } from "@/db/schema/commercial-document-lines";
import { isValidUuid } from "@/lib/uuid";

export interface PublicReceiptData {
  doc: SelectCommercialDocument;
  biz: SelectBusiness;
  lines: SelectCommercialDocumentLine[];
}

/**
 * Fetches a public receipt without authentication.
 * The document UUID acts as an unguessable public token (122 bits).
 *
 * Returns null when:
 * - documentId is not a valid UUID format (avoids Postgres cast errors)
 * - the document does not exist
 * - the document is not an ACCEPTED SALE
 * - the document has no `adeTransactionId` (no AdE fiscal identifier)
 *
 * The `adeTransactionId IS NOT NULL` clause is defense-in-depth (REVIEW.md #7):
 * finalize persists `adeTransactionId: adeResponse.idtrx ?? null`, so a drift in
 * the finalize/recovery flow could leave an ACCEPTED SALE without a fiscal
 * identifier. Serving such a document publicly would present it as a valid
 * receipt despite lacking the AdE transaction id — this guard prevents that.
 */
export async function fetchPublicReceipt(
  documentId: string,
): Promise<PublicReceiptData | null> {
  if (!isValidUuid(documentId)) return null;

  const db = getDb();

  const rows = await db
    .select({ doc: commercialDocuments, biz: businesses })
    .from(commercialDocuments)
    .innerJoin(businesses, eq(commercialDocuments.businessId, businesses.id))
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        eq(commercialDocuments.kind, "SALE"),
        eq(commercialDocuments.status, "ACCEPTED"),
        isNotNull(commercialDocuments.adeTransactionId),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const { doc, biz } = rows[0];

  const lines = await db
    .select()
    .from(commercialDocumentLines)
    .where(eq(commercialDocumentLines.documentId, doc.id))
    .orderBy(commercialDocumentLines.lineIndex);

  return { doc, biz, lines };
}
