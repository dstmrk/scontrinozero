import { calcLineTotalCents } from "@/lib/receipts/receipt-totals";
import {
  parsePublicRequest,
  readRawPaymentMethod,
} from "@/lib/receipts/public-request";
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
import type { SelectCommercialDocumentLine } from "@/db/schema/commercial-document-lines";
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
  "sconto_a_pagare",
  "incassato",
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

/**
 * Cella `metodo_pagamento`.
 *
 * Su un pagamento misto porta le modalità che hanno incassato, unite
 * (`contanti + elettronico`), non una di esse: scrivere solo la prima darebbe
 * a chi apre il file un metodo che non regge il confronto con `incassato`.
 *
 * Gli **importi** per metodo restano fuori dal riepilogo, che tiene una riga
 * per scontrino: aggiungere due colonne di importo cambierebbe la forma del
 * file per tutti per servire un caso che ancora non esiste in nessun dato.
 *
 * Il ramo scalare passa da `readRawPaymentMethod` e non da
 * `parsePublicRequest`: quest'ultimo degrada a `"PC"` sulle righe storiche
 * prive del campo, mentre qui la cella deve restare **vuota**. Una cella vuota
 * dice "non registrato"; `contanti` affermerebbe un fatto che quel documento
 * non porta.
 */
function extractPaymentMethod(publicRequest: unknown): string {
  const { payments } = parsePublicRequest(publicRequest);
  if (payments) {
    return payments
      .map((row) => PAYMENT_METHOD_LABELS.get(row.type) ?? row.type)
      .join(" + ");
  }

  const raw = readRawPaymentMethod(publicRequest);
  if (raw === null) return "";
  return PAYMENT_METHOD_LABELS.get(raw) ?? raw;
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
  const { globalDiscountCents } = parsePublicRequest(doc.publicRequest);

  return [
    formatRomeDate(doc.adeRegisteredAt),
    formatRomeTime(doc.adeRegisteredAt),
    doc.adeProgressive ?? "",
    // Fallback sul codice grezzo invece che stringa vuota: uno stato nuovo e
    // non tradotto deve essere visibile nel file, non sparire.
    STATUS_LABELS.get(doc.status) ?? doc.status,
    formatItalianAmount(total),
    // `totale` e' il corrispettivo, `incassato` e' cio' che e' entrato in
    // cassa: con uno sconto a pagare i due divergono di proposito (HAR.md
    // voce #3b). Tenerli affiancati e' l'unico modo perche' chi apre il file
    // veda subito che la differenza non e' un errore di quadratura.
    formatItalianAmount(globalDiscountCents / 100),
    formatItalianAmount((Math.round(total * 100) - globalDiscountCents) / 100),
    extractPaymentMethod(doc.publicRequest),
    description,
    doc.lotteryCode ?? "",
    doc.voidRegisteredAt ? formatRomeDate(doc.voidRegisteredAt) : "",
    doc.id,
    doc.adeTransactionId ?? "",
  ];
}

/**
 * Colonne del dettaglio, una riga per voce venduta.
 *
 * Ripete le colonne identificative del documento su ogni riga: e' cio' che
 * rende il file utilizzabile in una tabella pivot senza dover prima
 * "riempire" le celle vuote. `id_scontrino` e' la chiave con cui si ricollega
 * al riepilogo.
 *
 * `aliquota` porta il codice IVA cosi' com'e' (`22`, `10`, `N2`…): imponibile
 * e imposta NON sono qui: si calcolerebbero per riga, mentre il registro dei
 * corrispettivi scorpora per aliquota sul totale del periodo — due strade che
 * possono divergere di qualche centesimo. Meglio il dato certo (lordo +
 * aliquota) che una colonna "IVA" che non regge il confronto col registro.
 */
export const RECEIPT_LINES_CSV_HEADERS = [
  "data",
  "ora",
  "numero_ade",
  "stato",
  "riga",
  "descrizione",
  "quantita",
  "prezzo_unitario",
  "totale_riga",
  "aliquota",
  "id_scontrino",
] as const;

/**
 * Formatter della quantita', istanziato una sola volta a module scope come il
 * `receiptPriceFormatter` di `receipt-format.ts`: costruire un
 * `Intl.NumberFormat` costa, e qui le opzioni sono costanti.
 *
 * `maximumFractionDigits: 3` e' la precisione della colonna `numeric(10,3)` e
 * lascia cadere gli zeri di coda da solo (`2`, non `2,000`).
 * `useGrouping: false` toglie il separatore delle migliaia: in una cella CSV
 * `1.000` sarebbe di nuovo ambiguo, ed e' esattamente l'ambiguita' che questa
 * funzione esiste per togliere.
 */
const quantityFormatter = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 3,
  useGrouping: false,
});

/**
 * Numero decimale in convenzione italiana, senza zeri di coda.
 *
 * La quantita' arriva da Postgres come stringa `numeric(10,3)` — `"2.000"`,
 * `"0.500"` — e scriverla cosi' nel CSV e' un bug silenzioso: Excel italiano
 * legge `2.000` come **duemila**, perche' per lui il punto e' il separatore
 * delle migliaia. Va riformattata: `2`, `0,5`.
 */
export function formatItalianQuantity(raw: string | null): string {
  const value = Number.parseFloat(raw ?? "0");
  if (!Number.isFinite(value)) return "";
  return quantityFormatter.format(value);
}

/**
 * Righe CSV di dettaglio per uno scontrino: una per voce venduta.
 *
 * Il totale di riga usa il canone dei centesimi interi
 * (`round(prezzo * quantita * 100)`, regola 17): sommando questa colonna si
 * riottiene esattamente il `totale` del riepilogo, che deriva dagli stessi
 * centesimi. Con un arrotondamento diverso i due file non tornerebbero, ed e'
 * la prima cosa che un commercialista verifica.
 */
export function formatReceiptLineRows(
  doc: ReceiptDocRow,
  lines: readonly SelectCommercialDocumentLine[],
): string[][] {
  const data = formatRomeDate(doc.adeRegisteredAt);
  const ora = formatRomeTime(doc.adeRegisteredAt);
  const stato = STATUS_LABELS.get(doc.status) ?? doc.status;

  return lines.map((line) => {
    // Canone condiviso: il `totale_riga` del dettaglio deve sommare al
    // `totale` del riepilogo, che deriva da `calcDocTotal` sulle stesse righe.
    // Ricalcolarlo qui a mano è ciò che faceva perdere lo sconto di riga.
    const lineTotalCents = calcLineTotalCents(line);
    return [
      data,
      ora,
      doc.adeProgressive ?? "",
      stato,
      // 1-based: la prima voce dello scontrino e' la riga 1, non la riga 0.
      String(line.lineIndex + 1),
      line.description,
      formatItalianQuantity(line.quantity),
      formatItalianAmount(Number.parseFloat(line.grossUnitPrice ?? "0")),
      formatItalianAmount(lineTotalCents / 100),
      line.vatCode,
      doc.id,
    ];
  });
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
 * Righe CSV prodotte da un documento e dalle sue righe articolo. Il riepilogo
 * ne restituisce una, il dettaglio una per articolo: e' l'unica differenza
 * fra i due export, tutto il resto della pipeline e' condiviso.
 */
type DocRowsFormatter = (
  doc: ReceiptDocRow,
  lines: readonly SelectCommercialDocumentLine[],
) => string[][];

/**
 * Costruisce un ReadableStream<Uint8Array> con il CSV completo degli scontrini
 * filtrati: BOM, header riga 1, poi le righe prodotte da `formatRows`.
 *
 * Lo stream usa una cursor query (LIMIT/OFFSET) per evitare di tenere tutti
 * i documenti + lines in memoria contemporaneamente. Errori DB sono
 * propagati via `controller.error()` cosi' il client riceve un download
 * troncato (segnale che qualcosa e' andato storto).
 */
function buildCsvStream(
  params: BuildCsvStreamParams,
  headers: readonly string[],
  formatRows: DocRowsFormatter,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(CSV_BOM));
        controller.enqueue(encoder.encode(rowToCsv(headers)));

        let offset = 0;
        while (true) {
          const docs = await fetchDocsBatch(params, offset);
          if (docs.length === 0) break;

          const lines = await fetchLinesByDocIds(docs.map((d) => d.id));
          const byDoc = groupLinesByDocId(lines);

          for (const doc of docs) {
            for (const row of formatRows(doc, byDoc.get(doc.id) ?? [])) {
              controller.enqueue(encoder.encode(rowToCsv(row)));
            }
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

/** Riepilogo: una riga per scontrino, le voci collassate in `descrizione`. */
export function buildReceiptsCsvStream(
  params: BuildCsvStreamParams,
): ReadableStream<Uint8Array> {
  return buildCsvStream(params, RECEIPT_CSV_HEADERS, (doc, lines) => [
    formatReceiptRow(doc, calcDocTotal(lines), joinLineDescriptions(lines)),
  ]);
}

/** Dettaglio: una riga per voce venduta, con aliquota e importi della riga. */
export function buildReceiptLinesCsvStream(
  params: BuildCsvStreamParams,
): ReadableStream<Uint8Array> {
  return buildCsvStream(
    params,
    RECEIPT_LINES_CSV_HEADERS,
    formatReceiptLineRows,
  );
}
