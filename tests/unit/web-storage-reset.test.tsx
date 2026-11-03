import { describe, expect, it } from "vitest";

/**
 * Contratto del reset di Web Storage in `tests/setup.ts`: jsdom tiene lo
 * stesso `sessionStorage`/`localStorage` per tutti i test di un file, quindi
 * quello che un test scrive lo eredita il successivo. Il caso misurato:
 * `useCassa` persiste il carrello in `sessionStorage`, e in
 * `cassa-client.test.tsx` le righe aggiunte da un test ricomparivano nel
 * successivo ("multiple elements with text Vendita").
 *
 * I due test dipendono dall'ordine di esecuzione dentro il file, che in
 * vitest è sequenziale e dichiarativo: il primo sporca, il secondo verifica.
 * Se qualcuno toglie il reset dal setup, fallisce il secondo — qui, non in un
 * test a caso che conta le righe del carrello.
 */
describe("reset di Web Storage fra un test e l'altro (progetto jsdom)", () => {
  it("scrive in entrambi gli storage", () => {
    sessionStorage.setItem("cassa", "riga-di-un-altro-test");
    localStorage.setItem("printer", "preferenza-di-un-altro-test");

    expect(sessionStorage).toHaveLength(1);
    expect(localStorage).toHaveLength(1);
  });

  it("il test successivo parte da storage vuoti", () => {
    expect(sessionStorage).toHaveLength(0);
    expect(localStorage).toHaveLength(0);
  });
});
