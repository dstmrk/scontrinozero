import { describe, it, expect } from "vitest";

import { isPrintableDocument } from "./printable-document";

describe("isPrintableDocument", () => {
  it("consente il PDF di una vendita accettata", () => {
    expect(isPrintableDocument({ kind: "SALE", status: "ACCEPTED" })).toBe(
      true,
    );
  });

  // Il punto della regola: una volta annullata, la ricevuta di vendita non
  // deve piu' essere scaricabile — il documento fiscale valido e' l'annullo.
  it("nega il PDF di una vendita annullata", () => {
    expect(isPrintableDocument({ kind: "SALE", status: "VOID_ACCEPTED" })).toBe(
      false,
    );
  });

  // Stesso status della riga sopra, kind diverso, esito opposto: e' la ragione
  // per cui la regola non e' esprimibile sul solo `status`.
  it("consente il PDF di un annullo riuscito", () => {
    expect(isPrintableDocument({ kind: "VOID", status: "VOID_ACCEPTED" })).toBe(
      true,
    );
  });

  it("nega ogni stato non finale, su entrambi i kind", () => {
    for (const kind of ["SALE", "VOID"] as const) {
      for (const status of ["PENDING", "REJECTED", "ERROR"] as const) {
        expect(isPrintableDocument({ kind, status })).toBe(false);
      }
    }
  });

  // ACCEPTED su un VOID non esiste oggi (void-service scrive VOID_ACCEPTED):
  // se comparisse sarebbe uno stato incoerente, non un documento stampabile.
  it("nega un VOID in ACCEPTED", () => {
    expect(isPrintableDocument({ kind: "VOID", status: "ACCEPTED" })).toBe(
      false,
    );
  });
});
