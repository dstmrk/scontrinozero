/**
 * Tipi per la cassa mobile-first (Phase 4B).
 */

/** Aliquote IVA supportate nell'UI cassa */
export type VatCode =
  "4" | "5" | "10" | "22" | "N1" | "N2" | "N3" | "N4" | "N5" | "N6";

/** Metodi di pagamento supportati nell'UI cassa */
export type PaymentMethod = "PC" | "PE";

/** Riga del carrello */
export interface CartLine {
  id: string;
  description: string;
  quantity: number;
  grossUnitPrice: number; // in euro, e.g. 12.50
  /**
   * Sconto **della riga** in euro, già comprensivo della quantità — feature
   * Pro. Assente o 0 = nessuno sconto.
   *
   * ⚠️ Dato FISCALE: riduce la base imponibile e quindi l'IVA dovuta
   * (`HAR.md` voce #3a). È la grandezza `scontoLordo` dell'AdE, non uno
   * sconto per unità: su 3 pezzi da 40,00 scontati di 20,00 vale `20`.
   */
  lineDiscount?: number;
  vatCode: VatCode;
}

/**
 * Etichette brevi per badge e display compatti.
 *
 * ⚠️ Le nature seguono la lista PIATTA del **documento commerciale**
 * (tabella CODIFICHE del layout AdE, la stessa di `docs/api-spec.md` sez. 6),
 * non quella della fattura elettronica: qui `N6` è "Altro non IVA", non
 * l'inversione contabile — che nella FE è `N6.1`-`N6.9`, sottocodici che il
 * tracciato del documento commerciale non prevede nemmeno. Etichettare N6
 * come reverse charge farebbe scegliere all'esercente una natura sbagliata su
 * un documento fiscale irreversibile.
 */
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
  N6: "0% – Non IVA",
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
  N6: "0% – Altro non IVA",
};

/**
 * Etichette UI per i metodi di pagamento.
 *
 * ⚠️ `PE` è **"Elettronico"**, non "Carta". Il tracciato del documento
 * commerciale conosce solo `PC`/`PE` e il layout AdE li stampa come
 * `Pagamento contante` / `Pagamento elettronico` (vedi `PAYMENT_LABELS` in
 * `src/lib/receipt-format.ts`, unica sorgente di PDF, ricevuta pubblica e
 * stampa termica). `PE` copre quindi anche bonifico e app di pagamento, non
 * solo la carta: chiamarlo "Carta" faceva scegliere all'esercente una parola
 * che non ricompare da nessuna parte sul documento che sta emettendo.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PC: "Contanti",
  PE: "Elettronico",
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

const VAT_CODES_SET: ReadonlySet<string> = new Set(VAT_CODES);

/**
 * Returns true when `code` is non-null and NOT one of the supported VAT codes.
 * `null` is treated as "no preference" (always valid) — callers that require
 * a value should check for null separately.
 */
export function isInvalidPreferredVatCode(code: string | null): boolean {
  return code !== null && !VAT_CODES_SET.has(code);
}

/**
 * Type guard positivo: ritorna true se `value` è una stringa vuota (nessuna
 * preferenza) oppure un `VatCode` valido. Da usare al posto di cast diretto
 * `as VatCode | ""` su valori provenienti da DB / form pre-popolato.
 */
export function isValidPreferredVatCode(value: unknown): value is VatCode | "" {
  return (
    value === "" || (typeof value === "string" && VAT_CODES_SET.has(value))
  );
}

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
  /**
   * Sconto a pagare in euro (`scontoAbbuono` AdE) — feature Pro.
   *
   * ⚠️ NON è uno sconto sul corrispettivo (HAR.md voce #3b): il totale del
   * documento e l'IVA restano pieni, si riduce solo l'incassato. Assente o 0
   * = nessun abbuono.
   */
  globalDiscount?: number;
};

/**
 * Codici errore machine-readable per emitReceipt.
 *
 * - PENDING_IN_PROGRESS: una richiesta precedente con la stessa idempotencyKey
 *   è ancora in corso (fresh PENDING). Il client dovrebbe ritentare dopo
 *   qualche secondo, senza svuotare il carrello.
 * - DB_TIMEOUT: timeout DB; servizio temporaneamente sovraccarico.
 * - ALREADY_REJECTED: il documento esistente è stato rifiutato dall'AdE.
 *   Va emesso uno scontrino nuovo con una key diversa.
 * - IDEMPOTENCY_PAYLOAD_MISMATCH: la idempotencyKey è già stata usata per una
 *   richiesta con un payload diverso (righe/importi/pagamento/lotteria), oppure
 *   per un'operazione di annullo (VOID). Il client deve usare una nuova key per
 *   la nuova richiesta: emit e void non condividono mai la stessa key.
 * - ALREADY_VOIDED: la idempotencyKey identifica uno scontrino già annullato
 *   (VOID_ACCEPTED). Non è più valido: un replay dell'emissione non deve
 *   riportarlo ad ACCEPTED. Va emesso uno scontrino nuovo con una key diversa.
 * - ADE_UNAVAILABLE: l'AdE non ha risposto (rete/5xx/timeout SPID). Esito
 *   **ignoto**: il documento resta PENDING e il recovery lo riconcilia. Il
 *   retry va fatto con la STESSA idempotencyKey — una key nuova rischierebbe
 *   un doppione fiscale irreversibile.
 * - ADE_PASSWORD_EXPIRED: password Fisconline scaduta, va aggiornata dall'app
 *   web. Nessun retry automatico utile.
 *
 * L'assenza di codice (rifiuto funzionale AdE non classificato) mappa sul
 * canale API a `ADE_REJECTED` / 422.
 */
export type SubmitReceiptErrorCode =
  | "PENDING_IN_PROGRESS"
  | "DB_TIMEOUT"
  | "ALREADY_REJECTED"
  | "ALREADY_VOIDED"
  | "IDEMPOTENCY_PAYLOAD_MISMATCH"
  | "ADE_UNAVAILABLE"
  | "ADE_PASSWORD_EXPIRED";

/** Risultato della server action emitReceipt */
export type SubmitReceiptResult = {
  error?: string;
  code?: SubmitReceiptErrorCode;
  documentId?: string;
  adeTransactionId?: string;
  adeProgressive?: string;
  /**
   * Istante di registrazione del documento presso l'AdE, ISO 8601
   * (`commercial_documents.ade_registered_at`, migrazione 0031).
   *
   * Serve alla stampa su termica: sullo scontrino di carta la data deve essere
   * quella del documento — la stessa che finisce sul PDF e sulla ricevuta
   * pubblica — non un `new Date()` preso sul client, che divergerebbe di
   * qualche secondo e, a cavallo della mezzanotte, di un giorno. E nemmeno il
   * `createdAt` della riga, scritto PRIMA della chiamata AdE e quindi in
   * anticipo di tutta la latenza del round-trip (2-5s).
   */
  adeRegisteredAt?: string;
  passwordExpired?: boolean;
  /**
   * La sessione AdE interattiva (CIE) è assente/scaduta: l'utente deve
   * ri-collegarsi (approvare la notifica sull'app) prima di riprovare. Nessun
   * documento fiscale è stato trasmesso.
   */
  reauthRequired?: boolean;
};
