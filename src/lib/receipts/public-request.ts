/**
 * Lettura del jsonb `commercial_documents.public_request` — **puro,
 * client-safe**.
 *
 * `public_request` è la memoria di ciò che l'esercente ha chiesto e che non
 * vive in colonne normalizzate: pagamenti, codice lotteria e sconto a pagare.
 * Non esiste una migrazione che gli dia una forma: le righe storiche sono
 * `NULL`, o hanno solo `paymentMethod`, e restano tali per sempre. Ogni campo
 * si valida quindi singolarmente invece di castare il blob.
 *
 * Prima di questo modulo lo stesso parsing era riscritto in quattro punti
 * (storico, pagina pubblica, PDF, export CSV) più due letture inline nelle
 * route `/api/v1`. Un campo nuovo — è successo con lo sconto a pagare — andava
 * aggiunto in sei posti, e chi ne dimenticava uno mostrava un documento
 * fiscale sbagliato senza che nessun test se ne accorgesse.
 *
 * Qui NON deve mai comparire un import di `@/db`: la stampa termica gira su
 * client component (stesso vincolo di `receipt-totals.ts`).
 */

import type { PaymentMethod } from "@/types/cassa";

/**
 * Una voce del blocco pagamenti, in **centesimi interi** (regola 17) come
 * `globalDiscountCents`: le superfici di lettura le sommano e le sottraggono
 * dal totale, e su euro float `0.1 + 0.2 !== 0.3` produrrebbe un centesimo di
 * scarto fra il PDF e lo scontrino di carta dello stesso documento.
 */
export interface PaymentEntry {
  readonly type: PaymentMethod;
  readonly amountCents: number;
}

export interface ParsedPublicRequest {
  /** `PC` quando il dato manca o non è riconosciuto — vedi nota sul default. */
  readonly paymentMethod: PaymentMethod;
  /**
   * Ripartizione dell'incassato fra i metodi di pagamento, quando il documento
   * ne porta una. `null` **non** significa "nessun pagamento": significa che il
   * documento non ha una ripartizione e l'incassato sta tutto sul metodo
   * scalare — è il caso di ogni documento a metodo singolo e di ogni riga
   * storica. Per ottenere le voci da mostrare in entrambi i casi si usa
   * `resolvePaymentRows`, mai questo campo direttamente.
   *
   * Invariante del documento (`HAR.md` voce #5): Σ importi + sconto a pagare =
   * corrispettivo. Le voci qui sommano quindi all'**incassato**, non al totale.
   */
  readonly payments: readonly PaymentEntry[] | null;
  readonly lotteryCode: string | null;
  /**
   * Sconto a pagare (`scontoAbbuono` AdE) in **centesimi interi**, mai euro
   * float (regola 17): le superfici di lettura lo sottraggono dal totale, e
   * `0.1 + 0.2 !== 0.3` produrrebbe un centesimo di scarto fra il PDF e lo
   * scontrino di carta dello stesso documento.
   *
   * ⚠️ Non riduce il corrispettivo (HAR.md voce #3b): il totale del documento
   * e l'IVA restano pieni, cambia solo quanto il cliente sborsa.
   */
  readonly globalDiscountCents: number;
}

/**
 * Legge una singola voce di pagamento, o `null` se è malformata.
 *
 * Solo `PC` e `PE` sono ammessi: `TR` e le tre `NR_*` esistono nel tracciato
 * AdE (`HAR.md` voce #6) ma non le scriviamo mai, e `NR_EF` non è nemmeno un
 * importo — è un flag booleano mutuamente esclusivo con ogni altro pagamento.
 * Accettarle qui vorrebbe dire mostrarle senza saperle rendere.
 */
function parsePaymentEntry(raw: unknown): PaymentEntry | null {
  if (raw === null || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  if (entry.type !== "PC" && entry.type !== "PE") return null;

  const amount = entry.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return { type: entry.type, amountCents: Math.round(amount * 100) };
}

const PAYMENT_ORDER: Record<PaymentMethod, number> = { PC: 0, PE: 1 };

/** Ordine del tracciato AdE (`PC` prima di `PE`, voce #6). */
function byAdeOrder(a: PaymentEntry, b: PaymentEntry): number {
  return PAYMENT_ORDER[a.type] - PAYMENT_ORDER[b.type];
}

/**
 * Legge l'array `payments`, o `null` quando il documento non ne ha uno usabile.
 *
 * **Tutto o niente.** Una sola voce malformata invalida l'intero array invece
 * di essere scartata: su un misto, tenere una voce e buttare l'altra
 * mostrerebbe un documento fiscale con l'incasso dimezzato e nessun segnale
 * che manchi qualcosa. Degradare allo scalare mostra un importo che almeno
 * quadra col totale.
 *
 * Le voci a zero invece si scartano e basta: uno slot vuoto non è un dato, e
 * le superfici di stampa lo ometterebbero comunque (voce #17c).
 *
 * L'ordine è **normalizzato** su quello del tracciato AdE (`PC` prima di `PE`,
 * voce #6) invece di rispettare l'ordine di inserimento: le stesse voci
 * arrivate in ordine diverso devono produrre lo stesso scontrino, altrimenti
 * PDF, termica e ricevuta pubblica dello stesso documento si ordinano come
 * capita.
 */
function parsePayments(raw: unknown): readonly PaymentEntry[] | null {
  if (!Array.isArray(raw)) return null;

  const entries: PaymentEntry[] = [];
  for (const item of raw) {
    const entry = parsePaymentEntry(item);
    if (!entry) return null;
    if (entry.amountCents > 0) entries.push(entry);
  }
  entries.sort(byAdeOrder);

  return entries.length > 0 ? entries : null;
}

/**
 * Il metodo di pagamento **così com'è registrato**, o `null` quando il
 * documento non lo porta — senza la degradazione a `PC` di
 * `parsePublicRequest`.
 *
 * Esiste perché tre superfici hanno bisogno di distinguere "contanti" da "non
 * registrato", e degradare a `PC` inventerebbe un dato: il contratto pubblico
 * `/api/v1` espone `null`, la cella `metodo_pagamento` del CSV resta vuota, e
 * l'analytics attribuisce a `other`. La degradazione a `PC` serve solo alle
 * superfici di **stampa**, dove una copia consegnata al cliente deve pur
 * riportare una modalità.
 *
 * Nessuna validazione sul valore: chi lo consuma decide se normalizzarlo
 * (`normalizePaymentMethod` in analytics) o passarlo così com'è (`/api/v1`,
 * che non può cambiare forma a un dato già emesso).
 */
export function readRawPaymentMethod(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object") return null;
  const value = (raw as { paymentMethod?: unknown }).paymentMethod;
  return typeof value === "string" ? value : null;
}

/**
 * Ricompone le voci di pagamento da mostrare, qualunque sia la forma del
 * documento — **l'unico modo corretto di leggere il blocco pagamenti**.
 *
 * Un documento con ripartizione porta le sue voci così come sono state
 * trasmesse. Uno a metodo singolo — e ogni riga storica — non ne porta
 * nessuna: l'unica voce si ricompone dall'incassato, che il chiamante ha già
 * in mano perché è lui a conoscere le righe (`totale − sconto a pagare`).
 *
 * `collectedCents` a zero non produce nessuna voce: uno scontrino interamente
 * abbuonato non ha incasso, e una riga a zero non va stampata (voce #17c).
 *
 * Riordina sul tracciato AdE anche qui, non solo in lettura dal jsonb: qui
 * passano pure le superfici che ricevono l'array già costruito da un
 * chiamante (la ristampa dallo storico, la stampa in cassa), e l'ordine di
 * stampa non deve dipendere da chi ha composto l'array.
 */
export function resolvePaymentRows(
  parsed: {
    readonly paymentMethod: PaymentMethod;
    // `undefined` oltre a `null` perche' i tipi di stampa (PDF e termica)
    // dichiarano il campo opzionale: "assente" e "nessuna ripartizione" sono
    // la stessa cosa, e un chiamante non deve scegliere quale dei due scrivere.
    readonly payments?: readonly PaymentEntry[] | null;
  },
  collectedCents: number,
): readonly PaymentEntry[] {
  if (parsed.payments) return [...parsed.payments].sort(byAdeOrder);
  if (collectedCents === 0) return [];
  return [{ type: parsed.paymentMethod, amountCents: collectedCents }];
}

/**
 * Normalizza il jsonb in una forma tipata, degradando sui documenti storici.
 *
 * Il default `PC` non è un'invenzione: è ciò che l'app ha sempre mostrato per
 * le righe scritte prima che `paymentMethod` fosse persistito, e la ristampa
 * su termica deve riportare il pagamento reale del documento trasmesso.
 */
export function parsePublicRequest(raw: unknown): ParsedPublicRequest {
  const value =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};

  const lotteryCode =
    typeof value.lotteryCode === "string" && value.lotteryCode
      ? value.lotteryCode
      : null;

  const rawDiscount = value.globalDiscount;
  const globalDiscountCents =
    typeof rawDiscount === "number" &&
    Number.isFinite(rawDiscount) &&
    rawDiscount > 0
      ? Math.round(rawDiscount * 100)
      : 0;

  return {
    paymentMethod: value.paymentMethod === "PE" ? "PE" : "PC",
    payments: parsePayments(value.payments),
    lotteryCode,
    globalDiscountCents,
  };
}
