import { getConfig } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ASYNC_UTIL_TIMEOUT_MS } from "../setup";

/**
 * Il tetto delle utility async di Testing Library (`waitFor`, `findBy*`) è una
 * proprietà dell'**ambiente**, non di un singolo test: se resta al default di
 * 1s mentre `testTimeout` sta a 15s, un runner carico fa scadere l'asserzione
 * molto prima che il test abbia speso il suo budget, e il rosso che ne esce
 * parla di un elemento mancante invece che di una macchina lenta.
 *
 * Questo file è il contratto verificabile di quella configurazione: se qualcuno
 * rimuove la `configure()` da `tests/setup.ts`, o la disallinea dalla costante,
 * fallisce qui e non in un test a caso fra i 320 file jsdom.
 */
describe("configurazione Testing Library (progetto jsdom)", () => {
  it("applica il tetto async dichiarato da tests/setup.ts", () => {
    expect(getConfig().asyncUtilTimeout).toBe(ASYNC_UTIL_TIMEOUT_MS);
  });

  it("tiene il tetto async sotto testTimeout, così l'errore resta leggibile", () => {
    // 15_000 è il `testTimeout` di vitest.config.ts. Il margine non è
    // estetico: finché l'asserzione scade prima del test, il fallimento porta
    // con sé il dump del DOM ("Unable to find role…"), che dice dove guardare.
    // Superato `testTimeout`, vitest tronca il test e quel dump non esiste più.
    expect(ASYNC_UTIL_TIMEOUT_MS).toBeLessThan(15_000);
  });

  it("lascia comunque più respiro del default di 1s che ha prodotto il flake", () => {
    expect(ASYNC_UTIL_TIMEOUT_MS).toBeGreaterThan(1_000);
  });
});
