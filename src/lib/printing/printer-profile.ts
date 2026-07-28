/**
 * Adattatore fra il profilo stampante emesso dal **trasporto** e le opzioni
 * accettate dall'**encoder**.
 *
 * I due pacchetti sono dello stesso autore ma versionati in modo indipendente,
 * e le loro tabelle hanno divergiato:
 * `@point-of-sale/webbluetooth-receipt-printer@2` emette nell'evento
 * `connected` nomi che `@point-of-sale/receipt-printer-encoder@3` non accetta
 * più. Passarli dritti fa **lanciare il costruttore dell'encoder**, cioè fa
 * fallire la stampa — e proprio sui profili più comuni:
 *
 * | emesso dal trasporto | encoder v3            |
 * | -------------------- | --------------------- |
 * | `default`            | ✗ Unknown codepage    |
 * | `zjiang`             | ✗ Unknown codepage    |
 * | `epson` `xprinter` `mpt` `star` | ✓          |
 * | linguaggio `meow`    | ✗ language not supported |
 *
 * `default` è il profilo catch-all che matcha qualsiasi stampante con service
 * `000018f0` — la maggioranza delle stampantine BT economiche, cioè l'hardware
 * target di questa feature.
 *
 * Strategia: normalizzare quel che si può, **scartare** il resto. Un
 * `codepageMapping` assente non è un ripiego: l'encoder auto-seleziona la
 * codepage e per l'italiano atterra su CP437, che contiene tutte le accentate
 * minuscole ed è supportata da ogni stampante ESC/POS (le maiuscole le copre
 * `sanitizeThermalText`).
 */

import type { PrinterLanguage } from "./types";

/** Mapping codepage accettati dall'encoder v3 (verificati per probe). */
const ENCODER_CODEPAGE_MAPPINGS: ReadonlySet<string> = new Set([
  "epson",
  "xprinter",
  "mpt",
  "star",
  "bixolon",
  "pos-5890",
  "citizen",
  "hp",
]);

/** Rinomine dai nomi del trasporto v2 a quelli dell'encoder v3. */
const TRANSPORT_CODEPAGE_ALIASES: ReadonlyMap<string, string> = new Map([
  // Le ZJiang ZJ-58xx sono i cloni della famiglia POS-5890.
  ["zjiang", "pos-5890"],
]);

const ENCODER_LANGUAGES: ReadonlySet<string> = new Set<PrinterLanguage>([
  "esc-pos",
  "star-prnt",
  "star-line",
]);

/**
 * Normalizza il `codepageMapping` del trasporto per l'encoder.
 * Ritorna `undefined` quando il nome non è utilizzabile: l'encoder
 * auto-seleziona, che è sempre meglio di un throw a stampa avviata.
 */
export function resolveCodepageMapping(
  transportMapping: string | undefined,
): string | undefined {
  if (!transportMapping) return undefined;
  const aliased =
    TRANSPORT_CODEPAGE_ALIASES.get(transportMapping) ?? transportMapping;
  return ENCODER_CODEPAGE_MAPPINGS.has(aliased) ? aliased : undefined;
}

/**
 * Normalizza il linguaggio del trasporto. Degrada a `esc-pos` (lo standard
 * de-facto) invece di propagare un valore che farebbe lanciare l'encoder.
 */
export function resolvePrinterLanguage(
  transportLanguage: string | undefined,
): PrinterLanguage {
  return transportLanguage && ENCODER_LANGUAGES.has(transportLanguage)
    ? (transportLanguage as PrinterLanguage)
    : "esc-pos";
}
