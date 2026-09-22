import { describe, expect, it } from "vitest";
import { resolveServerUrl, SERVER_URLS } from "./server-target";

describe("resolveServerUrl", () => {
  it.each([
    ["prod", "https://app.scontrinozero.it"],
    ["sandbox", "https://sandbox.scontrinozero.it"],
    ["dev", "https://app-dev.scontrinozero.it"],
  ])("mappa %s sull'host dell'app di quell'ambiente", (target, url) => {
    expect(resolveServerUrl(target)).toBe(url);
  });

  it("serve ogni URL in https: il guscio non abilita il cleartext", () => {
    for (const url of Object.values(SERVER_URLS)) {
      expect(new URL(url).protocol).toBe("https:");
    }
  });

  it("fallisce se MOBILE_TARGET manca: nessun default verso un ambiente", () => {
    expect(() => resolveServerUrl(undefined)).toThrow(/MOBILE_TARGET/);
  });

  it("fallisce su stringa vuota, come se mancasse", () => {
    expect(() => resolveServerUrl("")).toThrow(/MOBILE_TARGET/);
  });

  it("fallisce su un valore sconosciuto e lo nomina", () => {
    expect(() => resolveServerUrl("production")).toThrow(/"production"/);
  });

  it("non accetta chiavi ereditate dal prototipo", () => {
    expect(() => resolveServerUrl("toString")).toThrow(/MOBILE_TARGET/);
    expect(() => resolveServerUrl("__proto__")).toThrow(/MOBILE_TARGET/);
  });

  it("non normalizza maiuscole o spazi: il valore arriva da uno script npm", () => {
    expect(() => resolveServerUrl("Prod")).toThrow(/MOBILE_TARGET/);
    expect(() => resolveServerUrl(" prod")).toThrow(/MOBILE_TARGET/);
  });
});
