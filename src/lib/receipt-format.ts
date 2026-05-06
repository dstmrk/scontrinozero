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
 * Formatta un importo in formato italiano senza simbolo (es. "12,50").
 * Distinto da `formatCurrency` di `@/lib/utils` che include "€".
 */
export function formatReceiptPrice(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
