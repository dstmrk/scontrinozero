import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  const result = manifest();

  it("dichiara i campi minimi per l'installabilità PWA", () => {
    expect(result.name).toBe("ScontrinoZero");
    expect(result.short_name).toBe("ScontrinoZero");
    expect(result.display).toBe("standalone");
    expect(result.start_url).toBe("/dashboard");
    expect(result.scope).toBe("/");
  });

  it("espone le icone 192 e 512 richieste da Android per l'installazione", () => {
    const sizes = (result.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("include almeno un'icona maskable per le adaptive icon Android", () => {
    const maskable = (result.icons ?? []).filter((icon) =>
      icon.purpose?.includes("maskable"),
    );
    expect(maskable.length).toBeGreaterThanOrEqual(1);
    expect(maskable[0].sizes).toBe("512x512");
    expect(maskable[0].src).toBe("/android-chrome-maskable-512x512.png");
  });

  it("mantiene un'icona 'any' distinta dalla maskable", () => {
    const any = (result.icons ?? []).filter((icon) =>
      icon.purpose?.includes("any"),
    );
    expect(any.length).toBeGreaterThanOrEqual(1);
  });
});
