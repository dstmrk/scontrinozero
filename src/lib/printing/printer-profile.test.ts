import { describe, it, expect } from "vitest";
import {
  resolveCodepageMapping,
  resolvePrinterLanguage,
} from "./printer-profile";

describe("resolveCodepageMapping", () => {
  it("passa attraverso i mapping che l'encoder v3 conosce", () => {
    expect(resolveCodepageMapping("epson")).toBe("epson");
  });

  it('mappa "zjiang" su pos-5890, che l\'encoder v3 non conosce più con quel nome', () => {
    // Il trasporto v2 emette ancora "zjiang" per il profilo "BlueTooth Printer";
    // passarlo tal quale all'encoder v3 lancia "Unknown codepage mapping".
    expect(resolveCodepageMapping("zjiang")).toBe("pos-5890");
  });

  it("scarta \"default\", che l'encoder v3 rifiuta, lasciando l'auto-selezione", () => {
    // È il profilo catch-all del trasporto: matcha QUALSIASI stampante che
    // annunci il service 000018f0, cioè la maggior parte delle economiche.
    // Senza questo scarto la stampa esplode proprio sull'hardware target.
    expect(resolveCodepageMapping("default")).toBeUndefined();
  });

  it("scarta un mapping sconosciuto invece di propagarlo", () => {
    expect(resolveCodepageMapping("qualcosa-di-nuovo")).toBeUndefined();
  });

  it("scarta undefined", () => {
    expect(resolveCodepageMapping(undefined)).toBeUndefined();
  });
});

describe("resolvePrinterLanguage", () => {
  it("accetta i linguaggi supportati dall'encoder", () => {
    expect(resolvePrinterLanguage("star-prnt")).toBe("star-prnt");
  });

  it('degrada "meow" a esc-pos invece di far lanciare l\'encoder', () => {
    // Profilo delle stampantine "cat" (service 0000ae30) del trasporto v2:
    // l'encoder v3 lancia "The specified language is not supported".
    expect(resolvePrinterLanguage("meow")).toBe("esc-pos");
  });

  it("degrada undefined a esc-pos", () => {
    expect(resolvePrinterLanguage(undefined)).toBe("esc-pos");
  });
});
