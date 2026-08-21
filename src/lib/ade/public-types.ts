/**
 * Public API types — DTO per le API pubbliche ScontrinoZero.
 *
 * Reference: docs/api-spec.md sez. 8-9
 */

// ---------------------------------------------------------------------------
// Tipi pagamento API pubblica (sez. 9.5)
// ---------------------------------------------------------------------------

export type PaymentType =
  | "CASH"
  | "ELECTRONIC"
  | "MEAL_VOUCHER"
  | "NOT_COLLECTED_INVOICE"
  | "NOT_COLLECTED_SERVICE"
  | "NOT_COLLECTED_CREDIT";

// ---------------------------------------------------------------------------
// Request: emissione vendita (sez. 8.1)
// ---------------------------------------------------------------------------

export interface SaleLineRequest {
  description: string;
  quantity: number;
  /** Prezzo lordo UNITARIO (HAR.md voce #12). */
  unitPriceGross: number;
  /**
   * Sconto **della riga**, lordo — già comprensivo della quantità.
   *
   * È la grandezza nativa `scontoLordo` del tracciato AdE (HAR.md voce #12):
   * su una riga da 2 pezzi a 3,00 con "sconto 1,00" qui va `1`, non `0.5`.
   * Il mapper lo passa a `scontoLordo` senza moltiplicarlo.
   */
  lineDiscount: number;
  vatCode: string;
  isGift: boolean;
}

export interface PaymentRequest {
  type: PaymentType;
  amount: number;
  /** Solo per MEAL_VOUCHER */
  count?: number;
}

export interface SaleDocumentRequest {
  date: string;
  /** Codice Lotteria degli Scontrini del cliente (8 char [A-Z0-9], solo con pagamento elettronico) */
  lotteryCode: string | null;
  isGiftDocument: boolean;
  lines: SaleLineRequest[];
  payments: PaymentRequest[];
  globalDiscount: number;
  deductibleAmount: number;
}

export interface SaleRequest {
  idempotencyKey: string;
  document: SaleDocumentRequest;
}

// ---------------------------------------------------------------------------
// Request: annullo (sez. 8.2)
// ---------------------------------------------------------------------------

export interface OriginalDocumentRef {
  transactionId: string;
  documentProgressive: string;
  date: string;
}

export interface VoidRequest {
  idempotencyKey: string;
  originalDocument: OriginalDocumentRef;
}

// ---------------------------------------------------------------------------
// Response (sez. 8.1, 8.5)
// ---------------------------------------------------------------------------

export type DocumentStatus =
  "PENDING" | "ACCEPTED" | "VOID_ACCEPTED" | "REJECTED" | "ERROR";

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

export interface DocumentResponse {
  success: boolean;
  status: DocumentStatus;
  transactionId: string | null;
  documentProgressive: string | null;
  errors: ApiError[];
}
