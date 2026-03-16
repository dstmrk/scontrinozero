import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatta un importo in euro nel formato italiano (es. 12,50 €) */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/**
 * Aggiunge una cifra al valore corrente (in centesimi) con logica cashier-style.
 * Le cifre scorrono da destra: premere 1, 3, 5, 8 → 0,01 → 0,13 → 1,35 → 13,58
 * Limite massimo: 999999 centesimi (€9.999,99).
 */
export function appendDigitCents(cents: number, digit: string): number {
  const MAX_CENTS = 999999;
  const newCents = cents * 10 + parseInt(digit, 10);
  return newCents > MAX_CENTS ? cents : newCents;
}

/** Rimuove l'ultima cifra dal valore in centesimi (backspace cashier-style). */
export function backspaceCents(cents: number): number {
  return Math.floor(cents / 10);
}
