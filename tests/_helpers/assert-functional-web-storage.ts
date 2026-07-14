/**
 * Guard fail-fast per l'environment jsdom: verifica che localStorage e
 * sessionStorage siano Storage funzionanti (quelli di jsdom), non gli stub
 * Web Storage di Node ≥ 25.
 *
 * Contesto: da Node 25 `localStorage`/`sessionStorage` esistono già su
 * `globalThis`; `populateGlobal` di vitest salta le chiavi già presenti sul
 * global, quindi lo Storage di jsdom non viene installato e i test vedono lo
 * stub di Node — che senza `--localstorage-file` è un oggetto senza metodi
 * (`localStorage.clear is not a function`). Il fix canonico è il flag
 * `--no-experimental-webstorage` in `test.execArgv` (vitest.config.ts);
 * questo guard trasforma un'eventuale regressione in un errore immediato e
 * leggibile invece di decine di failure criptici.
 */

const REQUIRED_METHODS = ["getItem", "setItem", "removeItem", "clear"] as const;

type StorageName = "localStorage" | "sessionStorage";

export function assertFunctionalWebStorage(
  globalLike: Partial<Record<StorageName, unknown>> = globalThis,
): void {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    const storage = globalLike[name] as
      Partial<Record<string, unknown>> | undefined | null;
    const missing = REQUIRED_METHODS.filter(
      (method) => typeof storage?.[method] !== "function",
    );
    if (missing.length > 0) {
      throw new Error(
        `${name} non è uno Storage funzionante in questo environment jsdom ` +
          `(metodi mancanti: ${missing.join(", ")}). Probabile stub Web ` +
          `Storage di Node ≥ 25 non sovrascritto da jsdom: verifica che ` +
          `vitest.config.ts passi --no-experimental-webstorage in ` +
          `test.execArgv.`,
      );
    }
  }
}
