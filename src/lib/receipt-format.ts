/**
 * Formattazione condivisa per le viste scontrino (web pubblico, PDF, e
 * future esportazioni). Mantiene una sola sorgente di verità per le label
 * dei metodi di pagamento e per il formatter monetario senza simbolo €
 * (richiesto dai layout fiscali a stretta larghezza).
 */

/**
 * Dicitura della riga "modalità di pagamento" del documento commerciale.
 *
 * Il layout standard AdE la scrive per esteso — `Pagamento contante 160,00`,
 * `Pagamento elettronico 80,00` — perché nel blocco pagamenti convive con
 * altre voci (`Non riscosso`, `Resto`, `Importo pagato`) e la sola parola
 * "Contante" non direbbe di che grandezza si tratta.
 */
export const PAYMENT_LABELS: Record<string, string> = {
  PC: "Pagamento contante",
  PE: "Pagamento elettronico",
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

/** Campi indirizzo dell'esercente, tutti opzionali a schema. */
export interface BusinessAddressFields {
  readonly address?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly zipCode?: string | null;
}

/** `""` per null/undefined/stringhe di soli spazi. */
function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Righe indirizzo dell'intestazione, nella forma del layout standard AdE:
 * la via su una riga, `Comune(PR), CAP` sulla successiva.
 *
 * Restituisce solo le righe che hanno davvero un contenuto — il business
 * nasce incompleto in onboarding, e una riga vuota su un documento fiscale
 * viola anche le prescrizioni di risparmio carta dell'AdE. La provincia si
 * stampa fra parentesi solo se c'è un comune a cui riferirla: `(MI), 20100`
 * da solo non è un indirizzo.
 */
export function formatBusinessAddressLines(
  fields: BusinessAddressFields,
): string[] {
  const street = trimmed(fields.address);
  const city = trimmed(fields.city);
  const province = trimmed(fields.province);
  const zipCode = trimmed(fields.zipCode);

  const locality = city && province ? `${city}(${province})` : city;
  const localityLine = [locality, zipCode].filter(Boolean).join(", ");

  return [street, localityLine].filter(Boolean);
}
