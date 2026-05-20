import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";

// Alias self-join: per ogni SALE, troviamo il documento VOID che lo annulla
// (se esiste). Senza il join la colonna `id_documento_annullato` del CSV
// resterebbe sempre vuota — il campo `voided_document_id` e' popolato solo
// sui VOID, e il CSV filtra `kind = "SALE"`.
const voidDocAlias = alias(commercialDocuments, "void_doc");
import {
  calcDocTotal,
  fetchLinesByDocIds,
  groupLinesByDocId,
} from "@/lib/receipts/document-lines";
import { CSV_BOM, rowToCsv } from "@/lib/csv";

/**
 * Batch size per la cursor query. 500 e' un compromesso fra memoria
 * (peak ~500 docs + lines in RAM) e roundtrip DB (per 50k scontrini
 * sono 100 query — accettabili).
 */
const BATCH_SIZE = 500;

export const RECEIPT_CSV_HEADERS = [
  "id",
  "numero_ade",
  "data_emissione",
  "tipo",
  "stato",
  "totale",
  "metodo_pagamento",
  "codice_lotteria",
  "id_transazione_ade",
  "id_documento_annullato",
] as const;

export type ReceiptStatusFilter = "ACCEPTED" | "VOID_ACCEPTED";

export type ReceiptDocRow = {
  id: string;
  kind: string;
  status: string;
  createdAt: Date;
  adeProgressive: string | null;
  adeTransactionId: string | null;
  lotteryCode: string | null;
  /**
   * ID del documento VOID che annulla questo SALE (NULL se mai annullato).
   * Popolato da LEFT JOIN su commercial_documents AS void_doc.
   */
  voidingDocumentId: string | null;
  publicRequest: unknown;
};

export type BuildCsvStreamParams = {
  businessId: string;
  status: ReceiptStatusFilter | null;
  dateFrom: Date | null;
  dateTo: Date | null;
};

function extractPaymentMethod(publicRequest: unknown): string {
  if (
    publicRequest !== null &&
    typeof publicRequest === "object" &&
    "paymentMethod" in publicRequest
  ) {
    const pm = (publicRequest as { paymentMethod?: unknown }).paymentMethod;
    if (typeof pm === "string") return pm;
  }
  return "";
}

function formatItalianAmount(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/**
 * Formatta una riga CSV per uno scontrino. Pure function — riusabile dai test
 * senza mock DB.
 */
export function formatReceiptRow(doc: ReceiptDocRow, total: number): string[] {
  return [
    doc.id,
    doc.adeProgressive ?? "",
    doc.createdAt.toISOString(),
    doc.kind,
    doc.status,
    formatItalianAmount(total),
    extractPaymentMethod(doc.publicRequest),
    doc.lotteryCode ?? "",
    doc.adeTransactionId ?? "",
    doc.voidingDocumentId ?? "",
  ];
}

function buildConditions(params: BuildCsvStreamParams) {
  const conditions = [
    eq(commercialDocuments.businessId, params.businessId),
    eq(commercialDocuments.kind, "SALE"),
  ];

  if (params.dateFrom) {
    conditions.push(gte(commercialDocuments.createdAt, params.dateFrom));
  }
  if (params.dateTo) {
    conditions.push(lt(commercialDocuments.createdAt, params.dateTo));
  }
  if (params.status) {
    conditions.push(eq(commercialDocuments.status, params.status));
  } else {
    conditions.push(
      inArray(commercialDocuments.status, ["ACCEPTED", "VOID_ACCEPTED"]),
    );
  }
  return conditions;
}

async function fetchDocsBatch(
  params: BuildCsvStreamParams,
  offset: number,
): Promise<ReceiptDocRow[]> {
  const db = getDb();
  const conditions = buildConditions(params);
  const rows = await db
    .select({
      id: commercialDocuments.id,
      kind: commercialDocuments.kind,
      status: commercialDocuments.status,
      createdAt: commercialDocuments.createdAt,
      adeProgressive: commercialDocuments.adeProgressive,
      adeTransactionId: commercialDocuments.adeTransactionId,
      lotteryCode: commercialDocuments.lotteryCode,
      voidingDocumentId: voidDocAlias.id,
      publicRequest: commercialDocuments.publicRequest,
    })
    .from(commercialDocuments)
    .leftJoin(
      voidDocAlias,
      and(
        eq(voidDocAlias.voidedDocumentId, commercialDocuments.id),
        eq(voidDocAlias.kind, "VOID"),
        eq(voidDocAlias.status, "VOID_ACCEPTED"),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(commercialDocuments.createdAt))
    .limit(BATCH_SIZE)
    .offset(offset);
  return rows as ReceiptDocRow[];
}

/**
 * Costruisce un ReadableStream<Uint8Array> con il CSV completo degli scontrini
 * filtrati. Emette in streaming: header riga 1, poi una riga per documento,
 * con totale calcolato dalle righe.
 *
 * Lo stream usa una cursor query (LIMIT/OFFSET) per evitare di tenere tutti
 * i documenti + lines in memoria contemporaneamente. Errori DB sono
 * propagati via `controller.error()` cosi' il client riceve un download
 * troncato (segnale che qualcosa e' andato storto).
 */
export function buildReceiptsCsvStream(
  params: BuildCsvStreamParams,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(CSV_BOM));
        controller.enqueue(encoder.encode(rowToCsv(RECEIPT_CSV_HEADERS)));

        let offset = 0;
        while (true) {
          const docs = await fetchDocsBatch(params, offset);
          if (docs.length === 0) break;

          const lines = await fetchLinesByDocIds(docs.map((d) => d.id));
          const byDoc = groupLinesByDocId(lines);

          for (const doc of docs) {
            const total = calcDocTotal(byDoc.get(doc.id) ?? []);
            controller.enqueue(
              encoder.encode(rowToCsv(formatReceiptRow(doc, total))),
            );
          }

          if (docs.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
