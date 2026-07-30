import { describe, it, expect } from "vitest";
import {
  isIncompatiblePrinterLanguage,
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
    // Il degrado resta la rete di sicurezza: l'accoppiamento con quel profilo
    // è però già rifiutato a monte da `isIncompatiblePrinterLanguage`.
    expect(resolvePrinterLanguage("meow")).toBe("esc-pos");
  });

  it("degrada undefined a esc-pos", () => {
    expect(resolvePrinterLanguage(undefined)).toBe("esc-pos");
  });
});

describe("isIncompatiblePrinterLanguage", () => {
  it('rifiuta "meow": raster proprietario, non è ESC/POS travestito', () => {
    // Stampare byte ESC/POS su una cat printer produce caratteri casuali su
    // un documento fiscale, senza alcun errore: va fermato all'accoppiamento.
    expect(isIncompatiblePrinterLanguage("meow")).toBe(true);
  });

  it("non rifiuta i linguaggi che l'encoder supporta", () => {
    expect(isIncompatiblePrinterLanguage("esc-pos")).toBe(false);
  });

  it("non rifiuta un profilo sconosciuto: lì il degrado a esc-pos è la scelta giusta", () => {
    // Un nome nuovo a monte è quasi sempre una ESC/POS non ancora in tabella:
    // rifiutarla la renderebbe inutilizzabile senza motivo.
    expect(isIncompatiblePrinterLanguage("qualcosa-di-nuovo")).toBe(false);
  });

  it("non rifiuta undefined", () => {
    expect(isIncompatiblePrinterLanguage(undefined)).toBe(false);
  });
});
