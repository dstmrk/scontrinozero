/**
 * Tipi per la cassa mobile-first (Phase 4B).
 */

/** Aliquote IVA supportate nell'UI cassa */
export type VatCode =
  | "4"
  | "5"
  | "10"
  | "22"
  | "N1"
  | "N2"
  | "N3"
  | "N4"
  | "N5"
  | "N6";

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

/** Etichette brevi per badge e display compatti */
export const VAT_LABELS: Record<VatCode, string> = {
  "4": "4%",
  "5": "5%",
  "10": "10%",
  "22": "22%",
  N1: "0% – Art. 15",
  N2: "0% – Non sogg.",
  N3: "0% – Non imp.",
  N4: "0% – Esente",
  N5: "0% – Margine",
  N6: "0% – Inv. cont.",
};

/** Descrizioni complete per il dropdown di selezione */
export const VAT_DESCRIPTIONS: Record<VatCode, string> = {
  "4": "4% – Ridotta",
  "5": "5% – Ridotta",
  "10": "10% – Ridotta",
  "22": "22% – Ordinaria",
  N1: "0% – Escluse art. 15",
  N2: "0% – Non soggette",
  N3: "0% – Non imponibili",
  N4: "0% – Esente",
  N5: "0% – Regime del margine",
  N6: "0% – Inv. contabile",
};

/** Etichette UI per i metodi di pagamento */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PC: "Contanti",
  PE: "Carta",
};

/** Aliquote IVA disponibili: prima le % standard, poi i codici natura */
export const VAT_CODES: VatCode[] = [
  "4",
  "5",
  "10",
  "22",
  "N1",
  "N2",
  "N3",
  "N4",
  "N5",
  "N6",
];

/** Metodi di pagamento disponibili */
export const PAYMENT_METHODS: PaymentMethod[] = ["PC", "PE"];

/** Input per la server action emitReceipt */
export type SubmitReceiptInput = {
  businessId: string;
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  idempotencyKey: string; // uuid generato client-side, per idempotenza
  /** Codice Lotteria degli Scontrini (8 char [A-Z0-9], solo con pagamento PE) */
  lotteryCode?: string | null;
};

/** Risultato della server action emitReceipt */
export type SubmitReceiptResult = {
  error?: string;
  documentId?: string;
  adeTransactionId?: string;
  adeProgressive?: string;
  passwordExpired?: boolean;
};
