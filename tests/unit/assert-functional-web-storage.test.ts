import { describe, expect, it } from "vitest";
import { assertFunctionalWebStorage } from "../_helpers/assert-functional-web-storage";

function functionalStorage(): Record<string, unknown> {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  };
}

describe("assertFunctionalWebStorage", () => {
  it("non lancia quando entrambi gli storage hanno tutti i metodi", () => {
    expect(() =>
      assertFunctionalWebStorage({
        localStorage: functionalStorage(),
        sessionStorage: functionalStorage(),
      }),
    ).not.toThrow();
  });

  it("lancia se localStorage è lo stub rotto di Node ≥ 25 (oggetto senza metodi)", () => {
    expect(() =>
      assertFunctionalWebStorage({
        localStorage: {},
        sessionStorage: functionalStorage(),
      }),
    ).toThrow(/localStorage.*getItem, setItem, removeItem, clear/);
  });

  it("lancia se manca un solo metodo e lo nomina nel messaggio", () => {
    const partial = functionalStorage();
    delete partial.clear;
    expect(() =>
      assertFunctionalWebStorage({
        localStorage: functionalStorage(),
        sessionStorage: partial,
      }),
    ).toThrow(/sessionStorage.*metodi mancanti: clear/);
  });

  it("lancia se lo storage è assente (undefined)", () => {
    expect(() =>
      assertFunctionalWebStorage({
        localStorage: functionalStorage(),
        sessionStorage: undefined,
      }),
    ).toThrow(/sessionStorage/);
  });

  it("il messaggio d'errore indica il fix (--no-experimental-webstorage)", () => {
    expect(() =>
      assertFunctionalWebStorage({
        localStorage: {},
        sessionStorage: functionalStorage(),
      }),
    ).toThrow(/--no-experimental-webstorage/);
  });
});
