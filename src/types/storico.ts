import type { DocumentStatus } from "@/lib/ade/public-types";

// ---------------------------------------------------------------------------
// List item
// ---------------------------------------------------------------------------

export interface ReceiptLineItem {
  description: string;
  quantity: string;
  grossUnitPrice: string;
  vatCode: string;
}

export interface ReceiptListItem {
  id: string;
  kind: "SALE" | "VOID";
  status: DocumentStatus;
  adeProgressive: string | null;
  adeTransactionId: string | null;
  createdAt: Date;
  /** Totale IVA inclusa, calcolato dalla somma delle righe (stringa con 2 decimali). */
  total: string;
  lines: ReceiptLineItem[];
}

// ---------------------------------------------------------------------------
// Search params + paginated result
// ---------------------------------------------------------------------------

/** Numero di scontrini per pagina nello storico. */
export const STORICO_PAGE_SIZE = 10;

/**
 * Valore del filtro stato nella pagina storico.
 * "" = tutti gli stati; altrimenti filtra per il valore specifico.
 */
export type StatusFilter = "" | "ACCEPTED" | "VOID_ACCEPTED";

export interface SearchReceiptsParams {
  /** Data inizio (ISO yyyy-MM-dd, inclusa). */
  dateFrom?: string;
  /** Data fine (ISO yyyy-MM-dd, inclusa). */
  dateTo?: string;
  /**
   * Filtro sullo stato del documento.
   * Se omesso restituisce solo ACCEPTED e VOID_ACCEPTED (nessun tentativo fallito).
   */
  status?: "ACCEPTED" | "VOID_ACCEPTED";
  /** Numero di pagina 1-based. Default 1. */
  page?: number;
  /** Dimensione pagina. Default STORICO_PAGE_SIZE. */
  pageSize?: number;
}

export interface SearchReceiptsResult {
  items: ReceiptListItem[];
  /** Numero totale di documenti che corrispondono ai filtri (senza paginazione). */
  total: number;
  /** Presente se la richiesta è stata rifiutata per input non valido (es. data impossibile). */
  error?: string;
}

// ---------------------------------------------------------------------------
// Void action
// ---------------------------------------------------------------------------

export interface VoidReceiptInput {
  /** UUID del documento SALE da annullare. */
  documentId: string;
  /** UUID per idempotenza (generato dal client). */
  idempotencyKey: string;
  /** businessId dell'utente autenticato. */
  businessId: string;
}

/**
 * Codici errore machine-readable per voidReceipt.
 *
 * - VOID_PENDING_IN_PROGRESS: un annullo precedente con la stessa idempotencyKey
 *   è ancora in corso (fresh PENDING). Il client dovrebbe ritentare dopo
 *   qualche secondo.
 * - VOID_ALREADY_TARGETED: un altro annullo concorrente sta agendo sulla stessa
 *   SALE (race condition fra utenti).
 * - DB_TIMEOUT: timeout DB; servizio temporaneamente sovraccarico (B20).
 * - VOID_SYNC_FAILED: l'annullo è stato registrato su AdE ma la sincronizzazione
 *   DB finale è fallita. Richiede cleanup manuale.
 */
export type VoidReceiptErrorCode =
  | "VOID_PENDING_IN_PROGRESS"
  | "VOID_ALREADY_TARGETED"
  | "DB_TIMEOUT"
  | "VOID_SYNC_FAILED";

export interface VoidReceiptResult {
  error?: string;
  code?: VoidReceiptErrorCode;
  voidDocumentId?: string;
  adeTransactionId?: string;
  adeProgressive?: string;
}
