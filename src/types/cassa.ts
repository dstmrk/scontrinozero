/**
 * Tipi per la cassa mobile-first (Phase 4B).
 */

/** Aliquote IVA supportate nell'UI cassa */
export type VatCode = "4" | "5" | "10" | "22";

/** Metodi di pagamento supportati nell'UI cassa */
export type PaymentMethod = "PC" | "PE";

/** Riga del carrello */
export interface CartLine {
  id: string;
  description: string;
  quantity: number;
  grossUnitPrice: number; // in euro, e.g. 12.50
  vatCode: VatCode;
}

/** Etichette UI per le aliquote IVA */
export const VAT_LABELS: Record<VatCode, string> = {
  "4": "4%",
  "5": "5%",
  "10": "10%",
  "22": "22%",
};

/** Etichette UI per i metodi di pagamento */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PC: "Contanti",
  PE: "Carta",
};

/** Aliquote IVA disponibili in ordine crescente */
export const VAT_CODES: VatCode[] = ["4", "5", "10", "22"];

/** Metodi di pagamento disponibili */
export const PAYMENT_METHODS: PaymentMethod[] = ["PC", "PE"];

/** Input per la server action emitReceipt */
export type SubmitReceiptInput = {
  businessId: string;
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  idempotencyKey: string; // uuid generato client-side, per idempotenza
};

/** Risultato della server action emitReceipt */
export type SubmitReceiptResult = {
  error?: string;
  documentId?: string;
  adeTransactionId?: string;
  adeProgressive?: string;
};
