import { createHmac } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Fallback usato SOLO fuori produzione quando `PIVA_HASH_SECRET` non è
 * impostato, così il dev loop e i test non richiedono il secret reale. In
 * produzione la sua assenza è fail-fast (vedi `getPivaHashSecret`).
 */
const DEV_FALLBACK_SECRET = "dev-only-piva-hash-secret-not-for-production";

let warnedMissingSecret = false;

/**
 * Carica il secret per l'HMAC della P.IVA dal env `PIVA_HASH_SECRET`.
 *
 * - In produzione: fail-fast se assente o vuoto/whitespace (regola 18,
 *   `?? default` non scatta su `""`). Un ledger anti-frode con secret vuoto
 *   sarebbe forzabile (P.IVA = 11 cifre, ~37 bit).
 * - Fuori produzione: `logger.warn` (una volta) e fallback deterministico, per
 *   non bloccare dev/test.
 */
function getPivaHashSecret(): string {
  const raw = process.env.PIVA_HASH_SECRET;
  if (raw && raw.trim() !== "") return raw;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PIVA_HASH_SECRET must be set (non-empty) in production — anti-fraud trial ledger",
    );
  }

  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    logger.warn(
      { errorClass: "piva_hash_secret_missing" },
      "PIVA_HASH_SECRET non impostato: uso il fallback dev (NON valido in produzione)",
    );
  }
  return DEV_FALLBACK_SECRET;
}

/**
 * Normalizza una P.IVA prima dell'hashing: rimuove tutto ciò che non è
 * alfanumerico (spazi, punti, trattini) e porta in uppercase. La P.IVA AdE è
 * già pulita (11 cifre), ma normalizzare evita che varianti tipografiche dello
 * stesso numero producano hash diversi → falle nel ledger anti-frode.
 */
function normalizePiva(piva: string): string {
  return piva.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * HMAC-SHA256 (hex) della P.IVA normalizzata, con pepper server-side. Token a
 * senso unico, non reversibile né enumerabile senza `PIVA_HASH_SECRET`: usato
 * come chiave del registro anti-frode `trial_vat_ledger`, che sopravvive alla
 * cancellazione dell'account senza conservare la P.IVA in chiaro.
 */
export function hashPiva(piva: string): string {
  return createHmac("sha256", getPivaHashSecret())
    .update(normalizePiva(piva))
    .digest("hex");
}
