/**
 * AdE module entry point — factory per AdeClient.
 *
 * Controllato da `ADE_MODE` environment variable.
 */

import type { AdeClient } from "./client";
import type { FisconlineCredentials } from "./types";
import { MockAdeClient } from "./mock-client";
import { RealAdeClient } from "./real-client";
import { adeSessionCache } from "./session-cache";
import { adeInteractiveSessionStore } from "./interactive-session-store";
import { logger } from "@/lib/logger";

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

/**
 * Parametri di `withAdeSession`, discriminati sul metodo di accesso AdE.
 *  - `fisconline`: il server ha le credenziali e può ri-loggarsi in silenzio →
 *    sessione riusata/creata da `adeSessionCache`.
 *  - `cie`: sessione stabilita interattivamente (push), non ri-creabile in
 *    silenzio → riusata dallo store interattivo; se assente/scaduta →
 *    `AdeReauthRequiredError`.
 */
export type WithAdeSessionParams =
  | {
      businessId: string;
      method: "fisconline";
      credentials: FisconlineCredentials;
    }
  | { businessId: string; method: "cie" };

/**
 * Esegue `fn` con un client AdE autenticato per `businessId` (REVIEW #5).
 *
 * - `ADE_MODE=real`, Fisconline: riusa la sessione via `adeSessionCache` (un solo
 *   login per più operazioni ravvicinate, serializzate per-business). Invariato.
 * - `ADE_MODE=real`, CIE: riusa la sessione depositata nello store interattivo;
 *   se assente/scaduta solleva `AdeReauthRequiredError`. Nessun login qui (il
 *   secondo fattore è umano).
 * - `ADE_MODE=mock`: nessuna cache. login/loginCie + logout per-operazione, così
 *   in dev/sandbox anche CIE dà un OK immediato senza sessione depositata.
 */
export async function withAdeSession<T>(
  params: WithAdeSessionParams,
  fn: (client: AdeClient) => Promise<T>,
): Promise<T> {
  const mode = getAdeMode();

  if (mode === "mock") {
    const client = createAdeClient("mock");
    if (params.method === "cie") {
      await client.loginCie({ username: "mock", password: "mock" });
    } else {
      await client.login(params.credentials);
    }
    try {
      return await fn(client);
    } finally {
      await client
        .logout()
        .catch((err) => logger.warn({ err }, "AdE logout failed"));
    }
  }

  if (params.method === "cie") {
    return adeInteractiveSessionStore.run(params.businessId, fn);
  }

  return adeSessionCache.run(params.businessId, params.credentials, fn);
}

/**
 * True se un business CIE non ha (più) una sessione interattiva viva e va
 * chiesto il rinnovo. Usato da emit/void per ritornare `reauthRequired` PRIMA
 * di inserire il documento PENDING (evita un documento bloccato dallo stale-gate
 * dopo un rinnovo). Solo in `ADE_MODE=real`: in mock CIE dà sempre OK.
 */
export function isCieSessionMissing(businessId: string): boolean {
  return getAdeMode() === "real" && !adeInteractiveSessionStore.has(businessId);
}
