import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commercialDocuments,
  commercialDocumentLines,
  businesses,
  profiles,
} from "@/db/schema";
import type { SelectCommercialDocument } from "@/db/schema/commercial-documents";
import type { SelectBusiness } from "@/db/schema/businesses";
import type { SelectCommercialDocumentLine } from "@/db/schema/commercial-document-lines";
import { isValidUuid } from "@/lib/uuid";
import { resolveReceiptFooterNote } from "./footer-note";
import { printableDocumentCondition } from "./printable-document";

export interface PublicReceiptData {
  doc: SelectCommercialDocument;
  biz: SelectBusiness;
  /**
   * Righe contabili del documento. Su un annullo sono quelle della **vendita
   * annullata**: un VOID non ha righe proprie (`commercial_document_lines` e'
   * popolata solo per i SALE) e la ricevuta di annullamento ristampa le stesse
   * righe dell'originale.
   */
  lines: SelectCommercialDocumentLine[];
  /**
   * La vendita annullata — valorizzata **solo** quando `doc.kind === "VOID"`.
   * Serve al blocco "Documento di riferimento: N. ..." della ricevuta di
   * annullamento, che riporta il progressivo dell'originale mentre il footer
   * riporta quello dell'annullo.
   */
  voidedSale: SelectCommercialDocument | null;
  /**
   * Messaggio di cortesia dell'esercente, gia' passato per il gate di piano
   * (`resolveReceiptFooterNote`): `null` quando non c'e' o quando il piano non
   * da' piu' accesso alla feature Pro. I renderer non vedono mai il piano.
   */
  footerNote: string | null;
}

/**
 * Fetches a public receipt without authentication.
 * The document UUID acts as an unguessable public token (122 bits).
 *
 * Returns null when:
 * - documentId is not a valid UUID format (avoids Postgres cast errors)
 * - the document does not exist
 * - the document is not printable (see `isPrintableDocument`: una vendita
 *   accettata o un annullo riuscito — mai una vendita gia' annullata)
 * - the document has no `adeTransactionId` (no AdE fiscal identifier)
 * - the document is a VOID whose voided SALE is unreachable (senza le righe
 *   dell'originale non c'e' una ricevuta di annullamento da mostrare)
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
    .select({
      doc: commercialDocuments,
      biz: businesses,
      // Il piano del titolare decide se il messaggio di cortesia si stampa.
      // Join su `profiles` invece di una seconda query: la riga `businesses` e'
      // gia' joinata e la FK e' indicizzata, quindi il gate non costa un
      // round-trip in piu' su una pagina pubblica.
      owner: {
        plan: profiles.plan,
        trialStartedAt: profiles.trialStartedAt,
        planExpiresAt: profiles.planExpiresAt,
        referralBonusDays: profiles.referralBonusDays,
      },
    })
    .from(commercialDocuments)
    .innerJoin(businesses, eq(commercialDocuments.businessId, businesses.id))
    .innerJoin(profiles, eq(businesses.profileId, profiles.id))
    .where(
      and(
        eq(commercialDocuments.id, documentId),
        printableDocumentCondition(),
        isNotNull(commercialDocuments.adeTransactionId),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const { doc, biz, owner } = rows[0];

  // Un annullo non ha righe proprie: ristampa quelle della vendita annullata.
  let voidedSale: SelectCommercialDocument | null = null;
  if (doc.kind === "VOID") {
    if (!doc.voidedDocumentId) return null;

    const [sale] = await db
      .select()
      .from(commercialDocuments)
      .where(eq(commercialDocuments.id, doc.voidedDocumentId))
      .limit(1);

    // La FK e' ON DELETE SET NULL: un VOID puo' restare orfano. Senza le righe
    // dell'originale non c'e' nulla da stampare — meglio un 404 di una
    // ricevuta mutila (stessa logica di REVIEW.md #7).
    if (!sale) return null;
    voidedSale = sale;
  }

  const linesDocumentId = voidedSale?.id ?? doc.id;

  const lines = await db
    .select()
    .from(commercialDocumentLines)
    .where(eq(commercialDocumentLines.documentId, linesDocumentId))
    .orderBy(commercialDocumentLines.lineIndex);

  return {
    doc,
    biz,
    lines,
    voidedSale,
    // Solo la vendita, come sul PDF e sulla termica — divergenza voluta dal
    // layout AdE, che il saluto sull'annullo ce l'ha. Motivazione per esteso
    // sul campo `footerNote` in `src/lib/pdf/commercial-document.ts`.
    footerNote:
      doc.kind === "SALE"
        ? resolveReceiptFooterNote(biz.receiptFooterNote, owner)
        : null,
  };
}
