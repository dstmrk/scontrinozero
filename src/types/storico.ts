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

export interface VoidReceiptResult {
  error?: string;
  voidDocumentId?: string;
  adeTransactionId?: string;
  adeProgressive?: string;
}
