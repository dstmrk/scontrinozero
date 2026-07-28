/**
 * Composizione fra rendering ESC/POS e trasporto Bluetooth.
 *
 * Vive in un modulo separato per un motivo di bundle: `receipt-escpos.ts`
 * importa staticamente l'encoder (~21 KB gz), quindi i call site **devono**
 * raggiungerlo con un `import()` dinamico. Concentrando qui quell'import, le
 * pagine cassa/storico/impostazioni possono importare questo modulo senza
 * trascinarsi dietro l'encoder: chi non stampa non lo scarica mai.
 */

import { getPrinterSnapshot, printBytes } from "./bluetooth-printer";
import { readPrinterPreferences } from "./printer-preferences";
import { PAPER_COLUMNS, type PrintableReceipt } from "./types";

/** Opzioni di encoding derivate dal profilo stampante + preferenze utente. */
function currentEncodeOptions() {
  const snapshot = getPrinterSnapshot();
  const preferences = readPrinterPreferences();
  return {
    columns: PAPER_COLUMNS[preferences.paperWidth],
    printQr: preferences.printQr,
    language: snapshot.language,
    codepageMapping: snapshot.codepageMapping,
  };
}

/**
 * Renderizza e stampa uno scontrino già emesso.
 *
 * @throws {import("./bluetooth-printer").PrinterError} `not-connected` | `unreachable`
 */
export async function printReceipt(receipt: PrintableReceipt): Promise<void> {
  const { buildReceiptCommands } = await import("./receipt-escpos");
  await printBytes(buildReceiptCommands(receipt, currentEncodeOptions()));
}

/**
 * Stampa di prova dalle impostazioni.
 *
 * Non è un vezzo: è l'unico modo per far verificare all'esercente **prima** di
 * emettere un documento fiscale che la larghezza carta sia quella giusta, che
 * gli accenti escano leggibili e che la sua stampante supporti davvero il
 * comando QR (che sulle economiche non è scontato).
 */
export async function printTestPage(): Promise<void> {
  const { buildTestPrintCommands } = await import("./test-print");
  await printBytes(buildTestPrintCommands(currentEncodeOptions()));
}
