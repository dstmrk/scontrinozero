import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
} from "@/db/schema";
import type { SelectCommercialDocument } from "@/db/schema/commercial-documents";
import type { SelectBusiness } from "@/db/schema/businesses";
import type { SelectCommercialDocumentLine } from "@/db/schema/commercial-document-lines";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 */
export async function fetchPublicReceipt(
  documentId: string,
): Promise<PublicReceiptData | null> {
  if (!UUID_REGEX.test(documentId)) return null;

  const db = getDb();

  const rows = await db
    .select({ doc: commercialDocuments, biz: businesses })
    .from(commercialDocuments)
    .innerJoin(businesses, eq(commercialDocuments.businessId, businesses.id))
    .where(eq(commercialDocuments.id, documentId))
    .limit(1);

  if (rows.length === 0) return null;

  const { doc, biz } = rows[0];

  if (doc.kind !== "SALE" || doc.status !== "ACCEPTED") return null;

  const lines = await db
    .select()
    .from(commercialDocumentLines)
    .where(eq(commercialDocumentLines.documentId, doc.id))
    .orderBy(commercialDocumentLines.lineIndex);

  return { doc, biz, lines };
}
