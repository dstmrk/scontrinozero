import type { DocumentStatus } from "@/lib/ade/public-types";
import type { PaymentEntry } from "@/lib/receipts/public-request";
import type { PaymentMethod } from "@/types/cassa";

// ---------------------------------------------------------------------------
// List item
// ---------------------------------------------------------------------------

export interface ReceiptLineItem {
  description: string;
  quantity: string;
  grossUnitPrice: string;
  /**
   * Sconto della riga (`line_discount`), lordo e già comprensivo della
   * quantità. `"0"` sulle righe emesse prima della migrazione 0034.
   *
   * ⚠️ Riduce la base imponibile e quindi l'IVA (`HAR.md` voce #3a): `total`
   * dello scontrino è già al netto di questi sconti.
   */
  lineDiscount: string;
  vatCode: string;
  /**
   * Pezzi già resi di questa riga, sommati sui resi accettati registrati da
   * ScontrinoZero (`"0"` se nessuno). Solo sulle righe di una vendita: è ciò
   * che il dialog di reso sottrae dal venduto. I resi fatti dal portale AdE
   * qui non compaiono; li vede il servizio di reso, che rilegge l'AdE.
   */
  returnedQuantity: string;
}

export interface ReceiptListItem {
  /**
   * Discriminante dell'unione `StoricoRow`: questa riga è un nostro documento,
   * letto dal DB. Le righe che vivono solo sull'archivio AdE portano `"ade"` e
   * sono molto più povere — vedi `AdeReceiptListItem`.
   */
  origin: "local";
  id: string;
  kind: "SALE" | "VOID" | "RETURN";
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
   * Su un reso (`kind = RETURN`): la vendita resa, citata dal blocco
   * "Documento di riferimento". `null` su vendite e annulli, e su un reso la
   * cui vendita non c'è più (FK ON DELETE SET NULL).
   */
  returnOf: {
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
   *
   * Su un pagamento misto non basta da solo: la ripartizione sta in
   * `payments`, e il blocco pagamenti si risolve con `resolvePaymentRows`.
   */
  paymentMethod: PaymentMethod;
  /**
   * Ripartizione dell'incassato fra più metodi (pagamento misto), o `null`
   * quando il documento non ne ha una — ogni documento a metodo singolo e ogni
   * riga storica.
   */
  payments: readonly PaymentEntry[] | null;
  /** Codice lotteria trasmesso, se presente. */
  lotteryCode: string | null;
  /** Totale IVA inclusa, calcolato dalla somma delle righe (stringa con 2 decimali). */
  total: string;
  lines: ReceiptLineItem[];
}

/**
 * Una riga dello storico che vive **solo** sull'archivio AdE: un documento
 * commerciale emesso altrove (portale web AdE, app AdE, altro software che usa
 * lo stesso servizio) e mai passato da ScontrinoZero.
 *
 * Sola lettura, e deliberatamente povera: la ricerca AdE restituisce la sola
 * testata. Voci vendute, pagamento, lotteria e sconti stanno nel dettaglio
 * (`GET /doc/documenti/{idtrx}/`), che è una chiamata per documento. Riempire
 * quei campi con dei default significherebbe scriverli nel CSV come se
 * fossero veri.
 *
 * Non copiamo queste righe nel nostro database: esistono per la durata di una
 * ricerca. La chiave di riga è `idtrx`, un identificativo opaco del portale —
 * NON un UUID nostro, e non usabile come `documentId` da nessuna parte.
 */
export interface AdeReceiptListItem {
  origin: "ade";
  idtrx: string;
  adeProgressive: string;
  /** Istante registrato dall'AdE, dal campo `data` del risultato di ricerca. */
  adeRegisteredAt: Date;
  /**
   * Derivato dal flag `annulli` della riga di vendita (`HAR.md` #16c), non da
   * uno stato nostro: su una riga `V` la stringa `"A"` significa "annullato".
   */
  status: "ACCEPTED" | "VOID_ACCEPTED";
  /** Totale IVA inclusa, 2 decimali — stessa forma di `ReceiptListItem`. */
  total: string;
}

/**
 * Una riga dell'elenco storico, da qualunque delle due sorgenti arrivi.
 * Si discrimina su `origin`, mai sulla presenza di un campo.
 */
export type StoricoRow = ReceiptListItem | AdeReceiptListItem;

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
 * Tetto sull'ampiezza del periodo che l'esercente può chiedere, in giorni
 * inclusivi, quando la ricerca include l'archivio AdE.
 *
 * **Da non confondere con `ADE_QUERY_MAX_DAYS`** (31, in
 * `ade-document-search.ts`), che è il vincolo del portale su una **singola**
 * query: un periodo più lungo non viene rifiutato, viene spezzato in una query
 * per mese solare.
 *
 * 366 e non "dal 1° gennaio": preso alla lettera, il vincolo all'anno solare
 * renderebbe dicembre non cercabile il 15 gennaio, cioè esattamente quando si
 * fanno i conti dell'anno chiuso. Una finestra scorrevole copre sempre "da
 * inizio anno" senza il gradino a Capodanno.
 *
 * Il tetto esiste comunque perché il merge fra le due sorgenti avviene in
 * memoria sulle liste intere, quindi il costo cresce col periodo mentre la
 * ricerca locale resta piatta. **Non** è la ritenzione dell'archivio a
 * imporlo: quello va indietro almeno due anni e mezzo (`HAR.md` #16f), quindi
 * questo numero è interamente una nostra scelta e si può alzare quando
 * qualcuno lo chiederà davvero.
 *
 * Vive fra i tipi perché lo leggono entrambi i lati: il server per rifiutare
 * un periodo troppo largo, il client per dirlo **prima** che l'utente prema
 * "Cerca".
 */
export const ADE_SEARCH_MAX_DAYS = 366;

/**
 * Esito della ricerca che include anche l'archivio AdE.
 *
 * I campi `ade*` descrivono **solo** il ramo AdE, e la loro esistenza separata
 * è il punto: quando l'Agenzia non risponde, `items` porta comunque le righe
 * nostre e `adeError` spiega cosa manca (regola 19). Un elenco svuotato da un
 * errore di rete su una sorgente accessoria sarebbe la risposta sbagliata.
 */
export interface SearchStoricoResult {
  items: StoricoRow[];
  /** Documenti che corrispondono ai filtri nelle DUE sorgenti, deduplicati. */
  total: number;
  /** Richiesta rifiutata: input non valido, piano non abilitato, rate limit. */
  error?: string;
  /** Il ramo AdE è fallito: le righe locali ci sono comunque. */
  adeError?: string;
  /** CIE senza sessione viva: serve un nuovo accesso, non un retry. */
  adeReauthRequired?: boolean;
  /** L'archivio AdE aveva più documenti di quanti ne abbiamo potuti leggere. */
  adeTruncated?: boolean;
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
 * - VOID_ALREADY_TARGETED: un'altra correzione concorrente — annullo o reso —
 *   sta agendo sulla stessa SALE (indice di correzione in volo, migr. 0042).
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
 * - ALREADY_RETURNED: la vendita ha almeno un reso registrato sull'AdE (anche
 *   fatto dal portale): annullarla stornerebbe il corrispettivo due volte
 *   (HAR.md #19f). Nessuna POST è partita.
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
  | "ADE_PASSWORD_EXPIRED"
  | "ALREADY_RETURNED";

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

// ---------------------------------------------------------------------------
// Return action (reso merce, HAR.md #19)
// ---------------------------------------------------------------------------

export interface ReturnReceiptInput {
  /** UUID del documento SALE da rendere. */
  documentId: string;
  /** UUID per idempotenza (generato dal client). */
  idempotencyKey: string;
  /** businessId dell'utente autenticato. */
  businessId: string;
  /**
   * Pezzi resi adesso per ogni riga della vendita, allineati per indice alle
   * righe del documento; `0` = riga non resa. Due decimali al massimo.
   */
  quantities: number[];
}

/**
 * Codici errore machine-readable per il reso. Quelli in comune con l'annullo
 * hanno lo stesso significato (vedi `VoidReceiptErrorCode`).
 *
 * - RETURN_PENDING_IN_PROGRESS: un reso su questa vendita è ancora in volo
 *   (con questa o con un'altra key). Ritentare fra qualche secondo.
 * - RETURN_NOT_ALLOWED: la vendita non si può rendere (annullata, anche dal
 *   portale; annullo in corso; non è una vendita accettata).
 * - RETURN_INVALID_QUANTITIES: quantità non valide o oltre il residuo letto
 *   dall'AdE in questo momento.
 * - RETURN_STATE_CHANGED: riconciliando un reso precedente rimasto in sospeso
 *   è risultato registrato sull'AdE. Il residuo è cambiato: la richiesta va
 *   rifatta sulle quantità aggiornate, non ritentata così com'è.
 * - RETURN_SYNC_FAILED: il reso è registrato sull'AdE ma la sincronizzazione
 *   DB finale è fallita. Richiede cleanup manuale.
 */
export type ReturnReceiptErrorCode =
  | "RETURN_PENDING_IN_PROGRESS"
  | "RETURN_NOT_ALLOWED"
  | "RETURN_INVALID_QUANTITIES"
  | "RETURN_STATE_CHANGED"
  | "RETURN_SYNC_FAILED"
  | "DB_TIMEOUT"
  | "IDEMPOTENCY_PAYLOAD_MISMATCH"
  | "NOT_FOUND"
  | "ADE_UNAVAILABLE"
  | "ADE_PASSWORD_EXPIRED";

export interface ReturnReceiptResult {
  error?: string;
  code?: ReturnReceiptErrorCode;
  returnDocumentId?: string;
  adeTransactionId?: string;
  adeProgressive?: string;
  /**
   * Sessione AdE interattiva (CIE) assente/scaduta: l'utente deve ri-collegarsi
   * prima di riprovare. Nessun reso è stato trasmesso.
   */
  reauthRequired?: boolean;
}
