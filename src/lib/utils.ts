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
 * Converte una stringa da tastierino numerico in numero.
 * "" → 0, "12" → 12, "12." → 12, "12.5" → 12.5
 */
export function parseAmount(value: string): number {
  if (!value || value === ".") return 0;
  return parseFloat(value);
}

/**
 * Aggiunge un carattere al valore corrente del tastierino.
 * Rispetta le regole: max 2 decimali, un solo punto decimale.
 */
export function appendKeypadChar(current: string, char: string): string {
  if (char === ".") {
    if (current.includes(".")) return current;
    return current === "" ? "0." : current + ".";
  }

  // Limit decimal digits to 2
  const dotIndex = current.indexOf(".");
  if (dotIndex !== -1 && current.length - dotIndex > 2) return current;

  // Prevent leading zeros (e.g. "007")
  if (current === "0" && char !== ".") return char;

  return current + char;
}

/** Rimuove l'ultimo carattere dal valore del tastierino */
export function backspaceKeypad(current: string): string {
  return current.slice(0, -1);
}
