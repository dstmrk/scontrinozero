import { z } from "zod/v4";

/**
 * Shared Zod schema for password fields.
 * Used by the registration form and the change-password form to ensure
 * identical validation rules without duplication.
 */
export const passwordFieldSchema = z
  .string()
  .min(8, "Almeno 8 caratteri.")
  .regex(/[A-Z]/, "Serve almeno una maiuscola.")
  .regex(/[a-z]/, "Serve almeno una minuscola.")
  .regex(/\d/, "Serve almeno un numero.")
  .regex(/[^A-Za-z0-9]/, "Serve almeno un carattere speciale (es. !).");

/**
 * Validates password strength:
 * - At least 8 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one digit (0-9)
 * - At least one special character (non-alphanumeric)
 */
export function isStrongPassword(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

/**
 * Validates a lottery code (Codice Lotteria degli Scontrini):
 * exactly 8 uppercase alphanumeric characters [A-Z0-9].
 */
export function isValidLotteryCode(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code);
}

/**
 * Normalises an email address: trims whitespace and lowercases.
 * Must be applied in every auth flow before validation and Supabase calls
 * to ensure consistent treatment regardless of user input casing.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Shared Zod schema for the Fisconline PIN.
 * AdE normativa: exactly 10 numeric digits (first 4 via portal/email,
 * last 6 by postal letter). Server must .trim() the raw input before
 * calling safeParse — the schema itself does not trim.
 */
export const adePinSchema = z
  .string()
  .regex(
    /^\d{10}$/,
    "Il PIN Fisconline è composto da 10 cifre numeriche. Se ne hai solo 4, aspetta la lettera con le ultime 6 cifre per posta.",
  );

/**
 * CAP italiano: esattamente 5 cifre numeriche.
 */
export const ITALIAN_ZIP_REGEX = /^\d{5}$/;
export const ITALIAN_ZIP_MESSAGE = "CAP non valido (5 cifre numeriche).";

export function isValidItalianZipCode(zipCode: string): boolean {
  return ITALIAN_ZIP_REGEX.test(zipCode);
}

/**
 * Zod schema riusabile per il CAP italiano (server + client).
 */
export const italianZipCodeSchema = z
  .string()
  .regex(ITALIAN_ZIP_REGEX, ITALIAN_ZIP_MESSAGE);

/**
 * Validates email format using linear-time string checks (no regex backtracking).
 * This is a structural check, not RFC 5322 compliance — real validation
 * happens when the confirmation email is delivered.
 */
export function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (email.includes(" ")) return false;

  const atIndex = email.indexOf("@");
  if (atIndex < 1) return false;
  if (email.includes("@", atIndex + 1)) return false;

  const domain = email.slice(atIndex + 1);
  if (domain.length === 0 || !domain.includes(".")) return false;

  return true;
}
