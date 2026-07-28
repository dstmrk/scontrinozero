/**
 * Pagina di prova della stampante.
 *
 * Serve a far verificare all'esercente, **senza emettere un documento
 * fiscale**, le tre cose che possono andare storte su una stampantina
 * economica e che nessun test automatico può accertare:
 *
 *  1. **larghezza carta** — la riga di righello va esattamente da bordo a
 *     bordo solo se 58/80mm è impostato giusto; se sborda o avanza spazio,
 *     l'impostazione è sbagliata;
 *  2. **set caratteri** — le accentate italiane, maiuscole comprese, devono
 *     essere leggibili;
 *  3. **supporto QR** — il comando `GS ( k` non è implementato da tutti i
 *     cloni: se la stampante non lo supporta, qui esce una riga di caratteri
 *     casuali e l'utente sa che deve disattivare il QR.
 */

import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";
import { sanitizeThermalText } from "./thermal-text";
import type { ReceiptEncodeOptions } from "./types";

/** Testo di prova: copre accentate minuscole e maiuscole dell'italiano. */
const CHARSET_SAMPLE = "àèéìòù ÀÈÉÌÒÙ";

export function buildTestPrintCommands(
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
  encoder.align("center").bold(true).line("ScontrinoZero").bold(false);
  encoder.line("Stampa di prova").align("left");
  encoder.rule();

  // Il righello occupa l'intera larghezza: è il riferimento visivo per capire
  // se la larghezza carta impostata è quella reale.
  encoder.line(
    "1234567890"
      .repeat(Math.ceil(options.columns / 10))
      .slice(0, options.columns),
  );
  encoder.line(`Larghezza: ${options.columns} colonne`);
  encoder.line(sanitizeThermalText(`Accenti: ${CHARSET_SAMPLE}`));
  encoder.line(sanitizeThermalText("Esempio: CAFFÈ 1,50"));

  if (options.printQr) {
    encoder.rule();
    encoder.line("QR di prova:");
    encoder.align("center").qrcode("https://scontrinozero.it").align("left");
  }

  encoder.rule();
  encoder.line("Se leggi tutto correttamente,");
  encoder.line("la stampante e' pronta.");
  encoder.newline(3).cut();

  return encoder.encode();
}
