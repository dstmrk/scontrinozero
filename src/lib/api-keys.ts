/**
 * Utilità per la generazione e validazione delle API key di ScontrinoZero.
 *
 * Formati:
 *   szk_live_<48chars>  — business key: emette scontrini per un esercente
 *   szk_mgmt_<48chars>  — management key: gestisce esercenti via Partner API
 *
 * La raw key viene mostrata UNA sola volta al momento della creazione e non
 * viene mai persistita. In DB si salva solo il SHA-256 hash (hex) e i primi
 * 12 caratteri per l'identificazione in UI (es. "szk_live_XXX").
 */
import { createHash, randomBytes } from "node:crypto";

const BUSINESS_PREFIX = "szk_live_";
const MANAGEMENT_PREFIX = "szk_mgmt_";
const KEY_PREFIX_UI_LENGTH = 12;

export type ApiKeyType = "business" | "management";

export type GeneratedApiKey = {
  /** Chiave in chiaro — mostrata una sola volta, non persistire. */
  raw: string;
  /** SHA-256 hash hex — da salvare in DB come key_hash. */
  hash: string;
  /** Prime 12 char della raw key — da salvare in DB come key_prefix. */
  prefix: string;
};

/**
 * Genera una nuova API key del tipo specificato.
 * La raw key NON deve essere persistita — usare solo hash e prefix.
 */
export function generateApiKey(type: ApiKeyType): GeneratedApiKey {
  const keyPrefix = type === "management" ? MANAGEMENT_PREFIX : BUSINESS_PREFIX;
  const body = randomBytes(36).toString("base64url"); // 48 chars
  const raw = keyPrefix + body;
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, KEY_PREFIX_UI_LENGTH);
  return { raw, hash, prefix };
}

/**
 * Calcola il SHA-256 hash (hex) di una raw key.
 * Usato sia per la generazione che per il lookup all'autenticazione.
 */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Ritorna true se la raw key è una management key (prefisso szk_mgmt_).
 */
export function isManagementKey(raw: string): boolean {
  return raw.startsWith(MANAGEMENT_PREFIX);
}

/**
 * Ritorna true se il formato della raw key è valido (business o management).
 */
export function isValidApiKeyFormat(raw: string): boolean {
  return raw.startsWith(BUSINESS_PREFIX) || raw.startsWith(MANAGEMENT_PREFIX);
}
