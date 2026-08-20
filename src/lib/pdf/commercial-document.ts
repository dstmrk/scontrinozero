/**
 * Documento commerciale in PDF a 58mm — di vendita o di annullamento.
 *
 * Il layout segue il **"layout standard"** pubblicato dall'AdE per il
 * documento commerciale (`Layout_documento_commerciale_v4`): ordine delle
 * sezioni, diciture (`DESCRIZIONE`/`Prezzo(€)`, `Pagamento contante`,
 * `Importo pagato`), `di cui IVA` sotto il totale e non prima, codice lotteria
 * in coda dopo il numero documento. Non è un obbligo di legge per noi — il
 * documento fiscale è quello trasmesso all'AdE — ma è la forma che il cliente
 * riconosce come scontrino, e ci evita che l'esercente debba spiegarla.
 *
 * Due voci del layout AdE restano fuori di proposito:
 *  - la matricola `RT <numero>`, che è del registratore telematico: noi
 *    emettiamo via Documento Commerciale Online e un RT non ce l'abbiamo,
 *    stamparne uno sarebbe falso;
 *  - `Non riscosso`, `Resto`, `Sconto a pagare`, `Omaggio`, che presuppongono
 *    feature che la cassa non ha (pagamento misto, sconti di riga, omaggi).
 *    Le "prescrizioni generali per il risparmio carta" dell'AdE chiedono
 *    comunque di NON stampare le voci a zero, quindi ometterle è conforme.
 *
 * L'annullo condivide tutto il layout tranne tre punti (pagina "DOCUMENTO
 * COMMERCIALE DI ANNULLO" dello stesso template, e PDF ufficiale trascritto in
 * `HAR.md` #16a): il sottotitolo diventa `emesso per ANNULLAMENTO`, sotto il
 * titolo compare `Documento di riferimento: N. <progressivo> del <data>` della
 * vendita annullata, e sparisce il blocco pagamenti — un annullo non incassa.
 * Il footer porta il progressivo e l'istante DELL'ANNULLO, non dell'originale.
 *
 * Il tipo è un'unione discriminata su `kind` perché l'invariante è reale: un
 * annullo senza il documento di riferimento sarebbe un documento fiscale
 * mutilo, e una vendita col blocco di riferimento sarebbe una bugia. Il
 * compilatore lo impedisce invece di lasciarlo a un controllo a runtime.
 *
 * La resa termica ESC/POS (`src/lib/printing/receipt-escpos.ts`) rispecchia
 * sezione per sezione questo file: le due stampe dello stesso documento non
 * devono mai divergere.
 */

import PDFDocument from "pdfkit";
import qrcode from "qrcode-generator";
import {
  PAYMENT_LABELS,
  formatBusinessAddressLines,
  formatReceiptDate,
  formatReceiptPrice,
  formatReceiptDateTime,
  receiptFooterNoteLines,
} from "@/lib/receipt-format";
import {
  computeReceiptTotals,
  type ReceiptTotals,
} from "@/lib/receipts/receipt-totals";
import {
  formatVatLegendLine,
  receiptVatLabel,
  receiptVatLegend,
} from "@/lib/receipts/vat-display";

export interface CommercialDocumentLine {
  description: string;
  quantity: number;
  grossUnitPrice: number;
  vatCode: string;
}

/** La vendita annullata, citata dal blocco "Documento di riferimento". */
export interface VoidedDocumentRef {
  adeProgressive: string;
  adeRegisteredAt: Date;
}

/** Campi comuni alle due forme del documento commerciale. */
interface CommonDocumentPdfData {
  businessName: string;
  vatNumber: string;
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  /**
   * Righe contabili. Su un annullo sono quelle della **vendita annullata**:
   * la ricevuta di annullamento le ristampa identiche.
   */
  lines: CommercialDocumentLine[];
  /**
   * Istante registrato dall'AdE (`commercial_documents.ade_registered_at`),
   * NON il `createdAt` della riga: quello precede la risposta AdE di tutta la
   * latenza del round-trip, e stamparlo darebbe al cliente un orario che
   * l'Agenzia non ha mai visto.
   */
  adeRegisteredAt: Date;
  adeProgressive: string;
  adeTransactionId: string;
  /**
   * URL pubblico `/r/<id>`, stampato come QR in coda al documento se
   * presente. `null`/assente = nessun QR (rispecchia `printQr` della
   * termica ESC/POS, v. `src/lib/printing/types.ts`).
   */
  publicUrl?: string | null;
}

export interface SaleDocumentPdfData extends CommonDocumentPdfData {
  kind: "SALE";
  paymentMethod: "PC" | "PE";
  /** Codice Lotteria degli Scontrini (8 char, solo PE) */
  lotteryCode?: string | null;
  /**
   * Messaggio di cortesia dell'esercente (feature Pro), stampato in coda dove
   * il layout standard AdE scrive "Arrivederci e grazie!". Arriva gia' risolto
   * dal gate di piano (`resolveReceiptFooterNote`): qui `null` significa solo
   * "non stampare nulla".
   *
   * Solo sulla vendita: un "Grazie e arrivederci!" su una ricevuta di
   * ANNULLAMENTO stonerebbe, e l'unione discriminata lo rende irraggiungibile
   * su un VOID invece di affidarlo a un controllo a runtime.
   */
  footerNote?: string | null;
}

export interface VoidDocumentPdfData extends CommonDocumentPdfData {
  kind: "VOID";
  /**
   * Obbligatorio: senza il riferimento all'originale la ricevuta di
   * annullamento non dice che cosa annulla.
   *
   * Nessun `paymentMethod` e nessun `lotteryCode`: il primo non ha senso su un
   * annullo, il secondo non compare sul PDF ufficiale (`HAR.md` #16e).
   */
  voidedDocument: VoidedDocumentRef;
}

export type CommercialDocumentPdfData =
  SaleDocumentPdfData | VoidDocumentPdfData;

// ─── Constants ──────────────────────────────────────────────────────────────

/** 58mm in pt (1mm = 2.8346pt). Compatible with 58mm and 80mm thermal printers. */
const PAGE_WIDTH = 165;
const MARGIN = 6;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
/** Lato del QR in pt: sta comodo in CONTENT_WIDTH (153pt) restando leggibile. */
const QR_SIZE = 90;

/** Larghezza della colonna importo nelle righe a due colonne (totali/pagamenti). */
const AMOUNT_W = 38;
const LABEL_W = CONTENT_WIDTH - AMOUNT_W;

type Doc = InstanceType<typeof PDFDocument>;

/** Posizione verticale corrente, mutata man mano che le sezioni disegnano. */
interface Cursor {
  y: number;
}

// ─── Primitive di disegno ───────────────────────────────────────────────────

function drawSeparator(doc: Doc, cur: Cursor): void {
  doc
    .moveTo(MARGIN, cur.y)
    .lineTo(PAGE_WIDTH - MARGIN, cur.y)
    .dash(1, { space: 2 })
    .stroke()
    .undash();
  cur.y += 5;
}

interface TextOptions {
  align?: "left" | "center" | "right";
  bold?: boolean;
  size?: number;
}

function drawText(
  doc: Doc,
  cur: Cursor,
  text: string,
  opts: TextOptions = {},
): void {
  const { align = "left", bold = false, size = 7 } = opts;
  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .text(text, MARGIN, cur.y, { width: CONTENT_WIDTH, align });
  cur.y = doc.y + 1;
}

/** Riga a due colonne `etichetta … importo`, usata da totali e pagamenti. */
function drawAmountRow(
  doc: Doc,
  cur: Cursor,
  label: string,
  amount: number,
  opts: { bold?: boolean; size?: number } = {},
): void {
  const { bold = false, size = 7 } = opts;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
  doc.text(label, MARGIN, cur.y, { width: LABEL_W, align: "left" });
  doc.text(formatReceiptPrice(amount), MARGIN + LABEL_W, cur.y, {
    width: AMOUNT_W,
    align: "right",
  });
  cur.y = doc.y + 1;
}

/**
 * QR code: griglia vettoriale via `qrcode-generator`.
 *
 * Nessun canvas/raster: la stessa libreria che alimenta `react-qr-code`
 * (già in dependency tree) espone la matrice di moduli sincrona, disegnata
 * qui come rettangoli pdfkit — coerente col QR nativo della termica
 * ESC/POS (`receipt-escpos.ts`), stesso URL pubblico.
 */
function drawQrCode(doc: Doc, cur: Cursor, url: string): void {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const moduleCount = qr.getModuleCount();
  const cellSize = QR_SIZE / moduleCount;
  const x = MARGIN + (CONTENT_WIDTH - QR_SIZE) / 2;

  doc.fillColor("black");
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        doc
          .rect(x + col * cellSize, cur.y + row * cellSize, cellSize, cellSize)
          .fill();
      }
    }
  }
  cur.y += QR_SIZE + 2;
}

// ─── Sezioni ────────────────────────────────────────────────────────────────

/**
 * Intestazione nell'ordine del layout AdE: ragione sociale, P.IVA, via,
 * `Comune(PR), CAP`; poi il titolo, il cui sottotitolo distingue le due forme
 * del documento; e su un annullo il blocco "Documento di riferimento".
 */
function drawHeader(
  doc: Doc,
  cur: Cursor,
  data: CommercialDocumentPdfData,
): void {
  drawText(doc, cur, data.businessName, {
    align: "center",
    bold: true,
    size: 8,
  });
  drawText(doc, cur, `P.IVA: ${data.vatNumber}`, {
    align: "center",
    size: 6,
  });
  for (const line of formatBusinessAddressLines(data)) {
    drawText(doc, cur, line, { align: "center", size: 6 });
  }
  cur.y += 2;
  drawSeparator(doc, cur);

  drawText(doc, cur, "DOCUMENTO COMMERCIALE", {
    align: "center",
    bold: true,
    size: 7,
  });
  drawText(
    doc,
    cur,
    data.kind === "VOID"
      ? "emesso per ANNULLAMENTO"
      : "di vendita o prestazione",
    { align: "center", bold: true, size: 6 },
  );

  if (data.kind === "VOID") {
    cur.y += 2;
    drawText(doc, cur, "Documento di riferimento:", {
      align: "center",
      size: 6,
    });
    drawText(
      doc,
      cur,
      `N. ${data.voidedDocument.adeProgressive} del ${formatReceiptDate(data.voidedDocument.adeRegisteredAt)}`,
      { align: "center", bold: true, size: 6 },
    );
  }

  cur.y += 2;
  drawSeparator(doc, cur);
}

/**
 * Riga descrittiva dell'articolo. Per quantità ≠ 1 il layout AdE aggiunge
 * sotto la riga di calcolo `n.Q * prezzo_unitario`.
 */
function renderLineDescription(line: CommercialDocumentLine): string {
  if (line.quantity === 1) return line.description;
  const qtyDisplay =
    line.quantity % 1 === 0 ? Math.round(line.quantity) : line.quantity;
  return `${line.description}\nn.${qtyDisplay} * ${formatReceiptPrice(line.grossUnitPrice)}`;
}

function drawLineItems(
  doc: Doc,
  cur: Cursor,
  lines: CommercialDocumentLine[],
  totals: ReceiptTotals,
): void {
  // Larghezze colonna (somma = CONTENT_WIDTH = 153pt):
  //   Descrizione 95pt (~62%), IVA 22pt (~14%), Prezzo 36pt (~24%)
  const COL_DESC = Math.round(CONTENT_WIDTH * 0.62);
  const COL_VAT = Math.round(CONTENT_WIDTH * 0.14);
  const COL_PRICE = CONTENT_WIDTH - COL_DESC - COL_VAT;

  doc.font("Helvetica").fontSize(6);
  doc.text("DESCRIZIONE", MARGIN, cur.y, { width: COL_DESC, align: "left" });
  doc.text("IVA", MARGIN + COL_DESC, cur.y, {
    width: COL_VAT,
    align: "center",
  });
  doc.text("Prezzo(€)", MARGIN + COL_DESC + COL_VAT, cur.y, {
    width: COL_PRICE,
    align: "right",
  });
  cur.y = doc.y + 2;

  lines.forEach((line, index) => {
    const rowStartY = cur.y;
    doc.font("Helvetica").fontSize(6.5);
    doc.text(renderLineDescription(line), MARGIN, rowStartY, {
      width: COL_DESC,
      align: "left",
    });
    const afterDescY = doc.y;

    doc.text(receiptVatLabel(line.vatCode), MARGIN + COL_DESC, rowStartY, {
      width: COL_VAT,
      align: "center",
    });
    doc.text(
      formatReceiptPrice(totals.perLine[index].lineTotal),
      MARGIN + COL_DESC + COL_VAT,
      rowStartY,
      { width: COL_PRICE, align: "right" },
    );

    cur.y = Math.max(afterDescY, rowStartY + 10) + 2;
  });

  drawSeparator(doc, cur);
}

/**
 * Totali nell'ordine AdE: `Subtotale`, `TOTALE COMPLESSIVO`, `di cui IVA`.
 *
 * Il layout standard espone un solo `di cui IVA` aggregato. Sotto, quando le
 * aliquote con IVA sono più di una, aggiungiamo il dettaglio per aliquota: è
 * informazione in più — la stessa che il layout compatto AdE mette in coda
 * come legenda `A:IVA 22,00%` — e non toglie nulla alla riga aggregata.
 */
function drawTotals(doc: Doc, cur: Cursor, totals: ReceiptTotals): void {
  drawAmountRow(doc, cur, "Subtotale", totals.grandTotal);
  drawAmountRow(doc, cur, "TOTALE COMPLESSIVO", totals.grandTotal, {
    bold: true,
    size: 8,
  });

  if (totals.vatTotal > 0) {
    drawAmountRow(doc, cur, "di cui IVA", totals.vatTotal, { bold: true });
    if (totals.vatByCode.size > 1) {
      for (const [code, vatAmount] of totals.vatByCode.entries()) {
        drawAmountRow(
          doc,
          cur,
          `di cui IVA ${receiptVatLabel(code)}`,
          vatAmount,
          {
            size: 6.5,
          },
        );
      }
    }
  }

  drawSeparator(doc, cur);
}

/**
 * Blocco pagamenti. `Importo pagato` va sempre indicato (prescrizioni
 * generali AdE); la riga della modalità sparisce se vale zero, come le altre
 * voci di pagamento a zero.
 */
function drawPayment(
  doc: Doc,
  cur: Cursor,
  data: SaleDocumentPdfData,
  totals: ReceiptTotals,
): void {
  if (totals.grandTotal !== 0) {
    const label = PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod;
    drawAmountRow(doc, cur, label, totals.grandTotal);
  }
  drawAmountRow(doc, cur, "Importo pagato", totals.grandTotal);
  drawSeparator(doc, cur);
}

/**
 * Legenda degli asterischi della colonna IVA (`*ES = Esente`), stampata solo
 * se il documento contiene almeno una natura — come nel layout standard AdE,
 * fra il blocco pagamenti e la data.
 */
function drawVatLegend(
  doc: Doc,
  cur: Cursor,
  lines: CommercialDocumentLine[],
): void {
  const legend = receiptVatLegend(lines.map((l) => l.vatCode));
  if (legend.length === 0) return;

  for (const entry of legend) {
    drawText(doc, cur, formatVatLegendLine(entry), { size: 6 });
  }
  drawSeparator(doc, cur);
}

/**
 * Piede: data e numero documento centrati, poi il codice lotteria con la sua
 * caption su riga propria, infine il QR verso la copia pubblica.
 */
function drawFooter(
  doc: Doc,
  cur: Cursor,
  data: CommercialDocumentPdfData,
): void {
  drawText(doc, cur, formatReceiptDateTime(data.adeRegisteredAt), {
    align: "center",
  });
  drawText(doc, cur, `DOCUMENTO N. ${data.adeProgressive}`, {
    align: "center",
  });

  // Solo la vendita: il PDF ufficiale di annullo non riporta il codice
  // lotteria (`HAR.md` #16e), e il tipo lo rende irraggiungibile su un VOID.
  if (data.kind === "SALE" && data.lotteryCode) {
    cur.y += 2;
    drawText(doc, cur, "Codice Lotteria", { align: "center", size: 6 });
    drawText(doc, cur, data.lotteryCode, { align: "center", bold: true });
  }

  // Messaggio di cortesia: dopo il blocco fiscale (data, numero, lotteria) e
  // prima del QR, che e' un'appendice digitale — sulla carta la riga di
  // cortesia chiude il documento.
  if (data.kind === "SALE") {
    const noteLines = receiptFooterNoteLines(data.footerNote);
    if (noteLines.length > 0) {
      cur.y += 2;
      for (const line of noteLines) {
        drawText(doc, cur, line, { align: "center", size: 6 });
      }
    }
  }

  if (data.publicUrl) {
    cur.y += 2;
    drawQrCode(doc, cur, data.publicUrl);
  }
}

/**
 * Stima l'altezza pagina da numero righe, aliquote e blocchi opzionali.
 *
 * Calibrata empiricamente: overhead fisso ≈ 145pt (intestazione su 4 righe +
 * titolo + separatori + totali con `di cui IVA` aggregato + pagamento con
 * `Importo pagato` + piede), 18pt per riga articolo (copre il wrap della riga
 * quantità), 12pt per aliquota distinta, 9pt per riga di legenda IVA più il
 * suo separatore, 22pt per il blocco lotteria (caption + codice).
 * Sovrastimare costa spazio bianco, sottostimare costa una seconda pagina: la
 * stima resta volutamente generosa. Il messaggio di cortesia costa 11pt per
 * riga logica: 9pt di riga a corpo 6 piu' il margine di un a capo del PDF, che
 * e' piu' largo delle 32 colonne della termica ma non infinito.
 */
function estimateHeight(data: CommercialDocumentPdfData): number {
  const vatCodes = data.lines.map((l) => l.vatCode);
  const uniqueVatRates = new Set(vatCodes).size;
  const legendRows = receiptVatLegend(vatCodes).length;
  const hasLotteryCode = data.kind === "SALE" && Boolean(data.lotteryCode);
  const footerNoteRows =
    data.kind === "SALE" ? receiptFooterNoteLines(data.footerNote).length : 0;
  return (
    145 +
    data.lines.length * 18 +
    uniqueVatRates * 12 +
    (legendRows > 0 ? legendRows * 9 + 5 : 0) +
    (hasLotteryCode ? 22 : 0) +
    (footerNoteRows > 0 ? footerNoteRows * 11 + 2 : 0) +
    // Nessun termine per l'annullo: scambia il blocco pagamenti (due righe
    // piu' separatore) col blocco di riferimento (due righe), quindi in
    // altezza si equivalgono.
    (data.publicUrl ? QR_SIZE + 12 : 0) +
    8
  );
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateCommercialDocumentPdf(
  data: CommercialDocumentPdfData,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const height = estimateHeight(data);
    const buffers: Buffer[] = [];

    const doc = new PDFDocument({
      size: [PAGE_WIDTH, height],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Gli importi NON sono ricalcolati qui: arrivano da `computeReceiptTotals`,
    // la stessa funzione che alimenta pagina pubblica e stampa termica, così
    // le tre rese dello stesso documento non possono divergere di un centesimo
    // (regola 17). `String(n)` è lossless sui double IEEE-754 — `Number(String(x))
    // === x` — quindi l'adattamento all'interfaccia stringa non perde nulla.
    const totals = computeReceiptTotals(
      data.lines.map((line) => ({
        quantity: String(line.quantity),
        grossUnitPrice: String(line.grossUnitPrice),
        vatCode: line.vatCode,
      })),
    );

    const cur: Cursor = { y: MARGIN };
    drawHeader(doc, cur, data);
    drawLineItems(doc, cur, data.lines, totals);
    drawTotals(doc, cur, totals);
    if (data.kind === "SALE") drawPayment(doc, cur, data, totals);
    drawVatLegend(doc, cur, data.lines);
    drawFooter(doc, cur, data);

    doc.end();
  });
}
