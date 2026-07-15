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
 * Bound massimo per una password di credenziale AdE (Fisconline/CIE).
 * Non è una regola AdE (Fisconline è 8–15 char), ma un cap difensivo al
 * boundary server: la password è una credenziale opaca cifrata as-is, quindi
 * evitiamo di cifrare/memorizzare stringhe arbitrariamente lunghe (fino al
 * limite di body di Next) inviate bypassando il client.
 */
export const ADE_PASSWORD_MAX_LENGTH = 128;

/**
 * Schema Zod per l'email dell'app CIE ID (username del metodo CIE).
 * Stesso criterio del client (`z.email()`), così il boundary server vale da
 * solo (regola 9) e non è più debole della validazione client.
 *
 * NB: NON è un'email applicativa da normalizzare — è una credenziale di un
 * sistema esterno (AdE/CIE). Case e spazi vanno preservati byte-per-byte come
 * la password: NON applicare `normalizeEmail()`. Il bound 254 è il massimo di
 * un indirizzo email (RFC 5321).
 */
export const adeCieEmailSchema = z
  .email("Inserisci l'email dell'app CIE ID.")
  .max(254, "Email troppo lunga.");

/**
 * CAP italiano: esattamente 5 cifre numeriche.
 */
const ITALIAN_ZIP_REGEX = /^\d{5}$/;
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
 * Limiti di lunghezza (in caratteri) per i campi di business + profilo.
 * Sorgente unica di verità: usare queste costanti in Zod schema, server-side
 * validation e qualsiasi label "max N caratteri" lato UI. Aggiornandone una
 * qui si propaga ovunque.
 */
export const BUSINESS_PROFILE_LIMITS = {
  firstName: 80,
  lastName: 80,
  businessName: 120,
  address: 150,
  streetNumber: 20,
  city: 80,
  province: 3,
} as const;

/**
 * Valida la lunghezza dei campi indirizzo opzionali di un business
 * (`businessName`, `streetNumber`, `city`, `province`). Restituisce il messaggio
 * d'errore del primo campo troppo lungo, o `null` se sono tutti validi.
 *
 * Estratto e condiviso tra `saveBusiness` (onboarding) e `updateBusiness`
 * (settings) per evitare drift e tenere la Cognitive Complexity dei due
 * caller sotto la soglia SonarCloud S3776 (15).
 */
export function validateBusinessOptionalFieldLengths(fields: {
  businessName: string | null;
  streetNumber: string | null;
  city: string | null;
  province: string | null;
}): string | null {
  const checks: ReadonlyArray<readonly [string | null, number, string]> = [
    [
      fields.businessName,
      BUSINESS_PROFILE_LIMITS.businessName,
      "La ragione sociale",
    ],
    [
      fields.streetNumber,
      BUSINESS_PROFILE_LIMITS.streetNumber,
      "Il numero civico",
    ],
    [fields.city, BUSINESS_PROFILE_LIMITS.city, "Il comune"],
    [fields.province, BUSINESS_PROFILE_LIMITS.province, "La provincia"],
  ];
  for (const [value, limit, label] of checks) {
    if (value && value.length > limit)
      return `${label} non può superare ${limit} caratteri.`;
  }
  return null;
}

/**
 * True se `path` è un redirect **relativo** sicuro da seguire post-login.
 *
 * Difesa anti-open-redirect condivisa da `signIn` (`auth-actions.ts`) e dal
 * callback OAuth/reset (`(auth)/callback/route.ts`): accetta solo path che
 * iniziano con un singolo `/` e rifiuta i protocol-relative `//evil.com` e
 * `/\evil.com` (alcuni browser normalizzano `\` in `/`, rendendoli equivalenti
 * a `//`) — entrambi erediterebbero il protocollo dell'origin puntando a un
 * host esterno. URL assoluti (`https://evil.com`), stringhe vuote e path senza
 * leading slash cadono nel `false` → il caller fa fallback a `/dashboard`.
 */
export function isSafeRelativeRedirect(path: string): boolean {
  if (!path.startsWith("/")) return false;
  const second = path[1];
  return second !== "/" && second !== "\\";
}

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
