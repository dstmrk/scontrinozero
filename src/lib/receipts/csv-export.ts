import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";

// Alias self-join: per ogni SALE, troviamo il documento VOID che lo annulla
// (se esiste). Senza il join la colonna `data_annullo` del CSV resterebbe
// sempre vuota — il campo `voided_document_id` e' popolato solo sui VOID, e
// il CSV filtra `kind = "SALE"`.
const voidDocAlias = alias(commercialDocuments, "void_doc");
import {
  calcDocTotal,
  fetchLinesByDocIds,
  groupLinesByDocId,
} from "@/lib/receipts/document-lines";
import { CSV_BOM, rowToCsv } from "@/lib/csv";
import { formatRomeDate, formatRomeTime } from "@/lib/date-utils";

/**
 * Batch size per la cursor query. 500 e' un compromesso fra memoria
 * (peak ~500 docs + lines in RAM) e roundtrip DB (per 50k scontrini
 * sono 100 query — accettabili).
 */
const BATCH_SIZE = 500;

/**
 * Colonne del riepilogo, una riga per scontrino.
 *
 * Ordine deliberato: prima ciò che una persona legge (quando, quanto, cosa),
 * in fondo gli identificativi tecnici. Un id tecnico resta nel file solo se
 * punta a qualcosa di raggiungibile: `id_scontrino` e' la chiave con cui
 * l'assistenza e la Developer API ritrovano il documento,
 * `id_transazione_ade` e' l'unico appiglio verso l'AdE in caso di
 * contestazione. Il vecchio `id_documento_annullato` e' sparito perche'
 * puntava a una riga che nel file non c'e' (l'export filtra `kind = "SALE"`,
 * i VOID non sono righe): al suo posto `data_annullo`, che e' l'informazione
 * che quella colonna provava a dare. Sparita anche `tipo`, che valeva `SALE`
 * su ogni riga.
 */
export const RECEIPT_CSV_HEADERS = [
  "data",
  "ora",
  "numero_ade",
  "stato",
  "totale",
  "metodo_pagamento",
  "descrizione",
  "codice_lotteria",
  "data_annullo",
  "id_scontrino",
  "id_transazione_ade",
] as const;

export type ReceiptStatusFilter = "ACCEPTED" | "VOID_ACCEPTED";

export type ReceiptDocRow = {
  id: string;
  kind: string;
  status: string;
  /**
   * Istante registrato dall'AdE: e' la data del documento, quella stampata
   * sulla copia consegnata al cliente. Il CSV la usa sia come colonna sia
   * come predicato di periodo — vedi `buildConditions`.
   */
  adeRegisteredAt: Date;
  adeProgressive: string | null;
  adeTransactionId: string | null;
  lotteryCode: string | null;
  /**
   * Istante di registrazione del VOID che annulla questo SALE (NULL se mai
   * annullato). Popolato da LEFT JOIN su commercial_documents AS void_doc.
   */
  voidRegisteredAt: Date | null;
  publicRequest: unknown;
};

export type BuildCsvStreamParams = {
  businessId: string;
  status: ReceiptStatusFilter | null;
  dateFrom: Date | null;
  dateTo: Date | null;
};

/**
 * Etichette in italiano dei codici tecnici.
 *
 * `Map` e non object literal: la chiave arriva da una colonna DB e da un
 * jsonb non tipizzato, e `Map.get` non puo' risolvere su `Object.prototype`
 * (`"constructor"` restituirebbe una funzione da un object literal).
 *
 * Non riusiamo `PAYMENT_LABELS` di `receipt-format.ts`: quelle sono le
 * diciture del layout AdE stampato ("Pagamento contante"), qui la colonna si
 * chiama gia' `metodo_pagamento` e ripetere "Pagamento" sarebbe rumore.
 */
const STATUS_LABELS = new Map<string, string>([
  ["ACCEPTED", "emesso"],
  ["VOID_ACCEPTED", "annullato"],
]);

const PAYMENT_METHOD_LABELS = new Map<string, string>([
  ["PC", "contanti"],
  ["PE", "elettronico"],
]);

/**
 * Separatore fra le descrizioni delle righe dentro l'unica cella
 * `descrizione`. Spaziato: senza spazi due articoli si leggono come uno solo
 * (`CaffèCornetto`), e con la virgola si confonderebbe con i decimali.
 */
const DESCRIPTION_JOIN = " | ";

function extractPaymentMethod(publicRequest: unknown): string {
  if (
    publicRequest !== null &&
    typeof publicRequest === "object" &&
    "paymentMethod" in publicRequest
  ) {
    const pm = (publicRequest as { paymentMethod?: unknown }).paymentMethod;
    if (typeof pm === "string") return PAYMENT_METHOD_LABELS.get(pm) ?? pm;
  }
  return "";
}

function formatItalianAmount(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/**
 * Descrizioni delle righe di uno scontrino, in una sola cella.
 *
 * Il CSV di riepilogo tiene una riga per scontrino: le N righe articolo
 * collassano qui. Chi ha bisogno del dettaglio riga-per-riga usa l'export
 * dedicato. Le descrizioni vuote o di soli spazi vengono saltate — una cella
 * `Caffè |  | Acqua` sembra un dato perso, non un articolo senza nome.
 */
export function joinLineDescriptions(
  lines: readonly { description: string }[],
): string {
  return lines
    .map((l) => l.description.trim())
    .filter((d) => d.length > 0)
    .join(DESCRIPTION_JOIN);
}

/**
 * Formatta una riga CSV per uno scontrino. Pure function — riusabile dai test
 * senza mock DB.
 *
 * `total` e `description` arrivano gia' calcolati dal chiamante, che ha in
 * mano le righe articolo: qui non si rifa' l'aritmetica del totale (la
 * canonica vive in `receipt-totals.ts`) ne' si riquery-a il DB.
 */
export function formatReceiptRow(
  doc: ReceiptDocRow,
  total: number,
  description: string,
): string[] {
  return [
    formatRomeDate(doc.adeRegisteredAt),
    formatRomeTime(doc.adeRegisteredAt),
    doc.adeProgressive ?? "",
    // Fallback sul codice grezzo invece che stringa vuota: uno stato nuovo e
    // non tradotto deve essere visibile nel file, non sparire.
    STATUS_LABELS.get(doc.status) ?? doc.status,
    formatItalianAmount(total),
    extractPaymentMethod(doc.publicRequest),
    description,
    doc.lotteryCode ?? "",
    doc.voidRegisteredAt ? formatRomeDate(doc.voidRegisteredAt) : "",
    doc.id,
    doc.adeTransactionId ?? "",
  ];
}

function buildConditions(params: BuildCsvStreamParams) {
  const conditions = [
    eq(commercialDocuments.businessId, params.businessId),
    eq(commercialDocuments.kind, "SALE"),
  ];

  // Il periodo si seleziona sulla stessa grandezza che la riga mostra
  // (`ade_registered_at`): filtrare su `created_at` includerebbe nel CSV di
  // gennaio uno scontrino datato 1 febbraio. Indice dedicato: migrazione 0032.
  if (params.dateFrom) {
    conditions.push(gte(commercialDocuments.adeRegisteredAt, params.dateFrom));
  }
  if (params.dateTo) {
    conditions.push(lt(commercialDocuments.adeRegisteredAt, params.dateTo));
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
      adeRegisteredAt: commercialDocuments.adeRegisteredAt,
      adeProgressive: commercialDocuments.adeProgressive,
      adeTransactionId: commercialDocuments.adeTransactionId,
      lotteryCode: commercialDocuments.lotteryCode,
      voidRegisteredAt: voidDocAlias.adeRegisteredAt,
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
    // `id` (UUID PRIMARY KEY) come chiave secondaria rende l'ordine TOTALE:
    // a parita' di `ade_registered_at` — normalissima in cassa — Postgres non
    // garantisce un ordine stabile fra due esecuzioni, e la paginazione
    // LIMIT/OFFSET ripeterebbe o salterebbe righe silenziosamente.
    .orderBy(
      desc(commercialDocuments.adeRegisteredAt),
      desc(commercialDocuments.id),
    )
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
            const docLines = byDoc.get(doc.id) ?? [];
            const total = calcDocTotal(docLines);
            controller.enqueue(
              encoder.encode(
                rowToCsv(
                  formatReceiptRow(doc, total, joinLineDescriptions(docLines)),
                ),
              ),
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
