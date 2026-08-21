/**
 * Lettura del jsonb `commercial_documents.public_request` — **puro,
 * client-safe**.
 *
 * `public_request` è la memoria di ciò che l'esercente ha chiesto e che non
 * vive in colonne normalizzate: metodo di pagamento, codice lotteria e sconto
 * a pagare. Non esiste una migrazione che gli dia una forma: le righe storiche
 * sono `NULL`, o hanno solo `paymentMethod`, e restano tali per sempre. Ogni
 * campo si valida quindi singolarmente invece di castare il blob.
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

export interface ParsedPublicRequest {
  /** `PC` quando il dato manca o non è riconosciuto — vedi nota sul default. */
  readonly paymentMethod: PaymentMethod;
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
    lotteryCode,
    globalDiscountCents,
  };
}
