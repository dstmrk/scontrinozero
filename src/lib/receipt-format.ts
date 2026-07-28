/**
 * Formattazione condivisa per le viste scontrino (web pubblico, PDF, e
 * future esportazioni). Mantiene una sola sorgente di verità per le label
 * dei metodi di pagamento e per il formatter monetario senza simbolo €
 * (richiesto dai layout fiscali a stretta larghezza).
 */

/** Codici documento commerciale per metodo di pagamento (AdE). */
export const PAYMENT_LABELS: Record<string, string> = {
  PC: "Contante",
  PE: "Elettronico",
};

/**
 * Formatter monetario senza simbolo, istanziato una sola volta a module scope:
 * costruire un `Intl.NumberFormat` è costoso e qui le opzioni sono costanti.
 */
const receiptPriceFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatta un importo in formato italiano senza simbolo (es. "12,50").
 * Distinto da `formatCurrency` di `@/lib/utils` che include "€".
 */
export function formatReceiptPrice(amount: number): string {
  return receiptPriceFormatter.format(amount);
}

// Module-scope: costruire un Intl.DateTimeFormat è costoso, le opzioni sono costanti.
const receiptDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formatta la data del documento come `DD-MM-YYYY HH:MM` in ora italiana.
 *
 * `formatToParts` evita i separatori locale-specifici (it-IT userebbe "/") e
 * soprattutto il fuso: in un container UTC `getHours()`/`getDate()` tornano
 * valori UTC, che vicino a mezzanotte e nei cambi d'ora divergono dall'ora
 * legale italiana. Condiviso fra PDF e stampa termica perché le due rese dello
 * stesso documento non devono mai riportare orari diversi.
 */
export function formatReceiptDateTime(date: Date): string {
  const parts = receiptDateFormatter.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}`;
}
