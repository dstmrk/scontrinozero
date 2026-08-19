/**
 * Tipi condivisi della stampa scontrino su termica ESC/POS (Web Bluetooth).
 *
 * Il layout stampato rispecchia 1:1 il PDF a 58mm generato da
 * `src/lib/pdf/commercial-document.ts`: stesso ordine di sezioni, stesse
 * label, stessi totali. Il PDF resta la corsia di fallback per i browser senza
 * Web Bluetooth (iOS, Firefox, webview in-app), quindi le due rese non devono
 * mai divergere.
 */

import type { PaymentMethod } from "@/types/cassa";

/** Intestazione dell'esercente, letta da `businesses`. */
export interface ReceiptPrintHeader {
  readonly businessName: string;
  readonly vatNumber: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly zipCode: string | null;
}

/**
 * Riga stampabile. Importi e quantità come stringhe decimali, la stessa forma
 * di `SelectCommercialDocumentLine` e di `ReceiptLineItem` (storico): così
 * `computeReceiptTotals` si riusa senza conversioni intermedie che
 * introdurrebbero drift sui centesimi (regola 17).
 */
export interface PrintableReceiptLine {
  readonly description: string;
  readonly quantity: string;
  readonly grossUnitPrice: string;
  readonly vatCode: string;
}

/** Documento commerciale pronto per la stampa. */
export interface PrintableReceipt {
  readonly header: ReceiptPrintHeader;
  readonly lines: readonly PrintableReceiptLine[];
  readonly paymentMethod: PaymentMethod;
  /**
   * Istante registrato dall'AdE (`commercial_documents.ade_registered_at`).
   *
   * MAI `new Date()` lato client, e nemmeno il `createdAt` della riga: quello
   * è scritto all'INSERT, prima della risposta AdE, e la carta porterebbe un
   * orario diverso da quello del PDF e della ricevuta pubblica.
   */
  readonly adeRegisteredAt: Date;
  readonly adeProgressive: string;
  /** Codice Lotteria degli Scontrini (8 char, solo pagamento PE). */
  readonly lotteryCode?: string | null;
  /** URL pubblico `/r/<id>`, stampato come QR se `printQr` è attivo. */
  readonly publicUrl?: string | null;
}

/** Larghezza carta supportata, in colonne di caratteri. */
export const PAPER_COLUMNS = {
  /** 58mm — la larghezza delle stampantine BT economiche. */
  "58": 32,
  /** 80mm — le termiche da banco. */
  "80": 48,
} as const;

export type PaperWidth = keyof typeof PAPER_COLUMNS;
export type PaperColumns = (typeof PAPER_COLUMNS)[PaperWidth];

/** Linguaggi di stampa accettati dall'encoder (v3). */
export type PrinterLanguage = "esc-pos" | "star-prnt" | "star-line";

export interface ReceiptEncodeOptions {
  readonly columns: PaperColumns;
  /** Stampa il QR della ricevuta digitale in coda allo scontrino. */
  readonly printQr: boolean;
  readonly language: PrinterLanguage;
  /**
   * Nome del mapping codepage già normalizzato per l'encoder
   * (`resolveCodepageMapping`). `undefined` = auto-selezione dell'encoder.
   */
  readonly codepageMapping?: string;
}
