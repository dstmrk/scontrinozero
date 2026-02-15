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
  unitPriceGross: number;
  unitDiscount: number;
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
  customerTaxCode: string | null;
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
  | "PENDING"
  | "ACCEPTED"
  | "VOID_ACCEPTED"
  | "REJECTED"
  | "ERROR";

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
