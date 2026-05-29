/**
 * AdE module entry point — factory per AdeClient.
 *
 * Controllato da `ADE_MODE` environment variable.
 */

import type { AdeClient } from "./client";
import { MockAdeClient } from "./mock-client";
import { RealAdeClient } from "./real-client";

export type AdeMode = "mock" | "real";

/**
 * Risolve `ADE_MODE` in modo strict, fail-closed.
 *
 * Sostituisce il pattern sparso `(process.env.ADE_MODE as ...) || "mock"`, che
 * in caso di variabile mancante o con valore inatteso cadeva silenziosamente su
 * `mock`: in produzione significherebbe far sembrare riuscite emissioni/annulli
 * fiscali senza interagire davvero con l'AdE.
 *
 * Politica:
 *  - `"real"` o `"mock"` espliciti → usati così come sono.
 *  - In `NODE_ENV === "production"` un valore assente o non riconosciuto
 *    fa **throw** (fail-closed): la misconfigurazione esplode subito invece di
 *    degradare in silenzio.
 *  - In dev/test si torna a `"mock"` per non richiedere setup esplicito.
 *
 * NB: NON si forza `ADE_MODE=real` in produzione. Sia produzione
 * (`scontrinozero.it`, `ADE_MODE=real`) sia sandbox (`sandbox.scontrinozero.it`,
 * `ADE_MODE=mock`) girano con `NODE_ENV=production`: imporre `real` romperebbe
 * la sandbox. Si richiede solo che il valore sia esplicito e valido.
 */
export function getAdeMode(): AdeMode {
  const raw = process.env.ADE_MODE;
  if (raw === "real" || raw === "mock") return raw;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `ADE_MODE non valido o assente in produzione: "${raw ?? ""}". ` +
        `Imposta esplicitamente ADE_MODE=real (produzione) o ADE_MODE=mock (sandbox).`,
    );
  }

  return "mock";
}

/**
 * Creates an AdeClient instance based on the specified mode.
 *
 * @param mode - "mock" for testing, "real" for production
 */
export function createAdeClient(mode: AdeMode): AdeClient {
  switch (mode) {
    case "mock":
      return new MockAdeClient();
    case "real":
      return new RealAdeClient();
    default:
      throw new Error(`Unknown ADE_MODE: ${mode}`);
  }
}
