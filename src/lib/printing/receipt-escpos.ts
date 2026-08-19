/**
 * Rendering del documento commerciale in comandi ESC/POS — di vendita o di
 * annullamento.
 *
 * Funzione **pura**: prende un `PrintableReceipt` e restituisce i byte da
 * mandare alla stampante. Nessun accesso a `navigator`, nessuno stato — così è
 * interamente testabile in Node senza hardware né DOM.
 *
 * Il layout rispecchia sezione per sezione il PDF a 58mm di
 * `src/lib/pdf/commercial-document.ts` (che resta la corsia di fallback per
 * i browser senza Web Bluetooth): stesse label, stesso ordine, stessi totali,
 * entrambi allineati al "layout standard" AdE del documento commerciale.
 * Le uniche differenze sono imposte dal supporto:
 *  - l'intestazione di colonna è `Prezzo` e non `Prezzo(€)` (il simbolo
 *    dell'euro non è in CP437 e verrebbe stampato come `?`);
 * L'etichetta IVA è la codifica AdE (`receiptVatLabel`, mnemonico + asterisco)
 * sciolta dalla legenda a piè di documento — la stessa del PDF.
 *
 * La matematica monetaria NON è reimplementata: arriva tutta da
 * `computeReceiptTotals`, la stessa funzione che alimenta PDF, pagina pubblica
 * e storico (regola 17 — centesimi per riga, mai per documento).
 */

import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";
// Import dal modulo PURO, non da `document-lines.ts`: quello importa `getDb()`
// e trascinerebbe il driver postgres nel bundle del browser.
import { computeReceiptTotals } from "@/lib/receipts/receipt-totals";
import {
  PAYMENT_LABELS,
  formatBusinessAddressLines,
  formatReceiptDate,
  formatReceiptPrice,
  formatReceiptDateTime,
} from "@/lib/receipt-format";
import {
  formatVatLegendLine,
  receiptVatLabel,
  receiptVatLegend,
} from "@/lib/receipts/vat-display";
import { sanitizeThermalText } from "./thermal-text";
import type {
  PrintableReceipt,
  PrintableReceiptLine,
  PrintableSaleReceipt,
  ReceiptEncodeOptions,
} from "./types";

/** Larghezza della colonna IVA: `receiptVatLabel` non supera i 3 caratteri. */
const VAT_COL = 4;
/** Larghezza della colonna importo di riga: copre fino a `99999,99`. */
const PRICE_COL = 8;
/** Larghezza della colonna importo nelle righe di totale. */
const AMOUNT_COL = 9;

type Encoder = InstanceType<typeof ReceiptPrinterEncoder>;

/**
 * Riga descrittiva della quantità, stampata sotto l'articolo quando qty ≠ 1
 * nella forma del layout AdE `n.Q * prezzo` (stesso comportamento del PDF:
 * il cliente vede il calcolo).
 *
 * Va emessa come **riga di tabella separata** e non come `\n` dentro la cella
 * descrizione: l'encoder non gestisce il newline dentro una cella e la riga
 * uscirebbe fuori dalle colonne, senza padding.
 */
function quantityNote(line: PrintableReceiptLine): string | null {
  const qty = Number.parseFloat(line.quantity);
  if (Number.isNaN(qty) || qty === 1) return null;
  const qtyDisplay = qty % 1 === 0 ? Math.round(qty) : qty;
  const unitPrice = Number.parseFloat(line.grossUnitPrice);
  return `n.${qtyDisplay} * ${formatReceiptPrice(unitPrice)}`;
}

/** Riga a due colonne label/importo, usata per la sezione totali. */
function amountRow(
  encoder: Encoder,
  columns: number,
  label: string,
  amount: number,
): void {
  encoder.table(
    [
      { width: columns - AMOUNT_COL, align: "left" },
      { width: AMOUNT_COL, align: "right" },
    ],
    [[sanitizeThermalText(label), formatReceiptPrice(amount)]],
  );
}

function printHeader(encoder: Encoder, receipt: PrintableReceipt): void {
  const { header } = receipt;
  encoder
    .align("center")
    .bold(true)
    .line(sanitizeThermalText(header.businessName))
    .bold(false);

  // Ordine del layout standard AdE: P.IVA subito sotto la ragione sociale,
  // poi la via e `Comune(PR), CAP` su righe distinte.
  encoder.line(`P.IVA: ${header.vatNumber}`);
  for (const line of formatBusinessAddressLines(header)) {
    encoder.line(sanitizeThermalText(line));
  }

  encoder.align("left").rule();
  encoder.align("center").bold(true).line("DOCUMENTO COMMERCIALE");
  encoder.line(
    receipt.kind === "VOID"
      ? "emesso per ANNULLAMENTO"
      : "di vendita o prestazione",
  );
  encoder.bold(false);

  if (receipt.kind === "VOID") {
    const { adeProgressive, adeRegisteredAt } = receipt.voidedDocument;
    encoder.line("Documento di riferimento:");
    encoder
      .bold(true)
      .line(`N. ${adeProgressive} del ${formatReceiptDate(adeRegisteredAt)}`)
      .bold(false);
  }

  encoder.align("left").rule();
}

function printLineItems(
  encoder: Encoder,
  receipt: PrintableReceipt,
  columns: number,
): void {
  const descCol = columns - VAT_COL - PRICE_COL;
  const itemColumns = [
    { width: descCol, align: "left" as const },
    { width: VAT_COL, align: "center" as const },
    { width: PRICE_COL, align: "right" as const },
  ];

  encoder.table(itemColumns, [["DESCRIZIONE", "IVA", "Prezzo"]]);

  const { perLine } = computeReceiptTotals(receipt.lines);

  receipt.lines.forEach((line, index) => {
    const rows: string[][] = [
      [
        sanitizeThermalText(line.description),
        receiptVatLabel(line.vatCode),
        formatReceiptPrice(perLine[index].lineTotal),
      ],
    ];
    const note = quantityNote(line);
    if (note) rows.push([note, "", ""]);
    encoder.table(itemColumns, rows);
  });

  encoder.rule();
}

/**
 * Totali nell'ordine AdE: `Subtotale`, `TOTALE COMPLESSIVO`, `di cui IVA`.
 *
 * Il layout standard espone un solo `di cui IVA` aggregato; il dettaglio per
 * aliquota si aggiunge sotto solo quando le aliquote con imposta sono più di
 * una, altrimenti ripeterebbe la riga precedente sprecando carta.
 */
function printTotals(
  encoder: Encoder,
  receipt: PrintableReceipt,
  columns: number,
): void {
  const { grandTotal, vatByCode, vatTotal } = computeReceiptTotals(
    receipt.lines,
  );

  amountRow(encoder, columns, "Subtotale", grandTotal);

  encoder.bold(true);
  amountRow(encoder, columns, "TOTALE COMPLESSIVO", grandTotal);
  if (vatTotal > 0) {
    amountRow(encoder, columns, "di cui IVA", vatTotal);
  }
  encoder.bold(false);

  // Nessun filtro sugli importi: `computeReceiptTotals` scarta già le voci a
  // zero centesimi, quindi ogni entry vale almeno 0,01.
  if (vatByCode.size > 1) {
    for (const [code, vatAmount] of vatByCode.entries()) {
      amountRow(
        encoder,
        columns,
        `di cui IVA ${receiptVatLabel(code)}`,
        vatAmount,
      );
    }
  }

  encoder.rule();
}

/**
 * Blocco pagamenti. `Importo pagato` va sempre indicato (prescrizioni
 * generali AdE per il risparmio carta); la riga della modalità sparisce se
 * vale zero, come ogni altra voce di pagamento a zero.
 */
function printPayment(
  encoder: Encoder,
  receipt: PrintableSaleReceipt,
  columns: number,
): void {
  const { grandTotal } = computeReceiptTotals(receipt.lines);

  if (grandTotal !== 0) {
    const paymentLabel =
      PAYMENT_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod;
    amountRow(encoder, columns, paymentLabel, grandTotal);
  }
  amountRow(encoder, columns, "Importo pagato", grandTotal);
  encoder.rule();
}

/**
 * Legenda degli asterischi della colonna IVA (`*ES = Esente`), stampata solo
 * se il documento contiene almeno una natura — come nel layout standard AdE,
 * fra il blocco pagamenti e la data.
 */
function printVatLegend(encoder: Encoder, receipt: PrintableReceipt): void {
  const legend = receiptVatLegend(receipt.lines.map((l) => l.vatCode));
  if (legend.length === 0) return;

  for (const entry of legend) {
    encoder.line(sanitizeThermalText(formatVatLegendLine(entry)));
  }
  encoder.rule();
}

/**
 * Piede: data e numero documento centrati, poi il codice lotteria con la
 * caption su riga propria, infine il QR verso la copia pubblica.
 */
function printFooter(
  encoder: Encoder,
  receipt: PrintableReceipt,
  options: ReceiptEncodeOptions,
): void {
  encoder.align("center");
  encoder.line(formatReceiptDateTime(receipt.adeRegisteredAt));
  encoder.line(`DOCUMENTO N. ${receipt.adeProgressive}`);

  // Solo la vendita: il PDF ufficiale di annullo non riporta il codice
  // lotteria (`HAR.md` #16e), e il tipo lo rende irraggiungibile su un VOID.
  if (receipt.kind === "SALE" && receipt.lotteryCode) {
    encoder.line("Codice Lotteria");
    encoder.bold(true).line(receipt.lotteryCode).bold(false);
  }

  if (options.printQr && receipt.publicUrl) {
    // QR nativo della stampante (GS ( k): nessun rendering raster, quindi
    // nessuna dipendenza da canvas nel bundle.
    encoder.newline().qrcode(receipt.publicUrl);
  }

  encoder.align("left").newline(3).cut();
}

/**
 * Costruisce i comandi ESC/POS per uno scontrino già emesso.
 *
 * @throws se `options.columns` non è una larghezza supportata dall'encoder.
 */
export function buildReceiptCommands(
  receipt: PrintableReceipt,
  options: ReceiptEncodeOptions,
): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({
    language: options.language,
    columns: options.columns,
    ...(options.codepageMapping
      ? { codepageMapping: options.codepageMapping }
      : {}),
  });

  encoder.initialize();
  printHeader(encoder, receipt);
  printLineItems(encoder, receipt, options.columns);
  printTotals(encoder, receipt, options.columns);
  // Un annullo non incassa: niente blocco pagamenti, come sul PDF.
  if (receipt.kind === "SALE") {
    printPayment(encoder, receipt, options.columns);
  }
  printVatLegend(encoder, receipt);
  printFooter(encoder, receipt, options);

  return encoder.encode();
}
