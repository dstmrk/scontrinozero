import type { DocumentStatus } from "@/lib/ade/public-types";
import type { PaymentMethod } from "@/types/cassa";

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
  /**
   * Istante dell'INSERT della riga. Resta l'ordinamento dell'elenco (indice
   * `idx_commercial_documents_business_created`), ma NON è la data mostrata:
   * per quella vale `adeRegisteredAt`.
   */
  createdAt: Date;
  /**
   * Istante registrato dall'AdE (`ade_registered_at`, migrazione 0031). È la
   * data che l'elenco mostra e che la ristampa su termica porta sulla carta,
   * così coincide con PDF e ricevuta pubblica.
   */
  adeRegisteredAt: Date;
  /**
   * L'annullo che ha annullato questa vendita, quando esiste. È l'entry point
   * della ricevuta di annullamento: dal dettaglio di una vendita annullata
   * l'esercente la apre e la stampa. `null` su una vendita ancora valida.
   */
  voidDocument: {
    id: string;
    adeProgressive: string;
    adeRegisteredAt: Date;
  } | null;
  /**
   * Sconto a pagare del documento, in **centesimi interi** (`scontoAbbuono`
   * AdE). Serve alla ristampa su termica e al dettaglio: il documento
   * consegnato al cliente deve riportare l'incassato reale, non il totale.
   *
   * ⚠️ NON riduce `total`, che resta il corrispettivo pieno (`HAR.md` voce
   * #3b). `0` sui documenti senza abbuono e su tutti quelli storici.
   */
  globalDiscountCents: number;
  /**
   * Metodo di pagamento del documento trasmesso all'AdE. Serve alla ristampa
   * su termica: una copia consegnata al cliente non può riportare un
   * pagamento diverso da quello del documento originale.
   */
  paymentMethod: PaymentMethod;
  /** Codice lotteria trasmesso, se presente. */
  lotteryCode: string | null;
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

/**
 * Rilettura di un singolo documento, stessa forma di una riga dell'elenco.
 *
 * `item` è `null` sia quando il documento non esiste sia quando la richiesta è
 * stata rifiutata: il chiamante (lo storico dopo un annullo) tiene la riga che
 * ha già invece di svuotarla — degradare, non rompere (regola 19).
 */
export interface GetReceiptDetailResult {
  item: ReceiptListItem | null;
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
 * - DB_TIMEOUT: timeout DB; servizio temporaneamente sovraccarico.
 * - VOID_SYNC_FAILED: l'annullo è stato registrato su AdE ma la sincronizzazione
 *   DB finale è fallita. Richiede cleanup manuale.
 * - IDEMPOTENCY_PAYLOAD_MISMATCH: la idempotencyKey è già stata usata per
 *   annullare un documento diverso. Il client deve usare una nuova key.
 * - NOT_FOUND: lo scontrino da annullare non esiste (o appartiene a un altro
 *   business). Sul canale API mappa a 404, coerente con GET /v1/receipts/{id}.
 * - ADE_UNAVAILABLE: l'AdE non ha risposto (rete/5xx/timeout SPID). Esito
 *   **ignoto**: il retry va fatto con la STESSA idempotencyKey.
 * - ADE_PASSWORD_EXPIRED: password Fisconline scaduta, va aggiornata dall'app
 *   web. Nessun retry automatico utile.
 *
 * L'assenza di codice (rifiuto funzionale AdE non classificato) mappa sul
 * canale API a `ADE_REJECTED` / 422.
 */
export type VoidReceiptErrorCode =
  | "VOID_PENDING_IN_PROGRESS"
  | "VOID_ALREADY_TARGETED"
  | "DB_TIMEOUT"
  | "VOID_SYNC_FAILED"
  | "IDEMPOTENCY_PAYLOAD_MISMATCH"
  | "NOT_FOUND"
  | "ADE_UNAVAILABLE"
  | "ADE_PASSWORD_EXPIRED";

export interface VoidReceiptResult {
  error?: string;
  code?: VoidReceiptErrorCode;
  voidDocumentId?: string;
  adeTransactionId?: string;
  adeProgressive?: string;
  /**
   * Sessione AdE interattiva (CIE) assente/scaduta: l'utente deve ri-collegarsi
   * prima di riprovare. Nessun annullo è stato trasmesso.
   */
  reauthRequired?: boolean;
}
