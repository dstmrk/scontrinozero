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
// Search params
// ---------------------------------------------------------------------------

export interface SearchReceiptsParams {
  /** Data inizio (ISO yyyy-MM-dd, inclusa). */
  dateFrom?: string;
  /** Data fine (ISO yyyy-MM-dd, inclusa). */
  dateTo?: string;
  /** Filtro su adeProgressive (ricerca parziale). */
  progressivo?: string;
  /**
   * Filtro sullo stato del documento.
   * Se omesso restituisce tutti gli stati (ACCEPTED + VOID_ACCEPTED + ERROR).
   */
  status?: "ACCEPTED" | "VOID_ACCEPTED";
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
