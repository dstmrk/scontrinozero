import { describe, expect, it, vi } from "vitest";

describe("sitemap", () => {
  it("returns all pages with correct structure", async () => {
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result).toHaveLength(33);

    // Root
    expect(result[0]).toMatchObject({
      url: "https://scontrinozero.it",
      changeFrequency: "monthly",
      priority: 1,
    });

    // Marketing pages
    expect(result[1]).toMatchObject({
      url: "https://scontrinozero.it/prezzi",
      changeFrequency: "monthly",
      priority: 0.8,
    });
    expect(result[2]).toMatchObject({
      url: "https://scontrinozero.it/funzionalita",
      changeFrequency: "monthly",
      priority: 0.8,
    });

    // Legal
    expect(result[3]).toMatchObject({
      url: "https://scontrinozero.it/privacy",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[4]).toMatchObject({
      url: "https://scontrinozero.it/privacy/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[5]).toMatchObject({
      url: "https://scontrinozero.it/termini",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[6]).toMatchObject({
      url: "https://scontrinozero.it/termini/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[7]).toMatchObject({
      url: "https://scontrinozero.it/cookie-policy",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[8]).toMatchObject({
      url: "https://scontrinozero.it/cookie-policy/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });

    // Help center hub
    expect(result[9]).toMatchObject({
      url: "https://scontrinozero.it/help",
      changeFrequency: "monthly",
      priority: 0.6,
    });

    // Help articles — verify all 21 are present (order may change as articles are added)
    const helpUrls = result.map((e) => e.url);
    const expectedHelpArticles = [
      "https://scontrinozero.it/help/prima-configurazione",
      "https://scontrinozero.it/help/primo-scontrino",
      "https://scontrinozero.it/help/installare-app",
      "https://scontrinozero.it/help/come-collegare-ade",
      "https://scontrinozero.it/help/credenziali-fisconline",
      "https://scontrinozero.it/help/cassetto-fiscale",
      "https://scontrinozero.it/help/errori-ade",
      "https://scontrinozero.it/help/sicurezza-credenziali",
      "https://scontrinozero.it/help/annullare-scontrino",
      "https://scontrinozero.it/help/chiusura-giornaliera",
      "https://scontrinozero.it/help/storico-ed-esportazione",
      "https://scontrinozero.it/help/regime-forfettario",
      "https://scontrinozero.it/help/aliquote-iva",
      "https://scontrinozero.it/help/normativa-pos-2026",
      "https://scontrinozero.it/help/piani-e-prezzi",
      "https://scontrinozero.it/help/api",
      "https://scontrinozero.it/help/cambio-piano",
      "https://scontrinozero.it/help/fatture-e-ricevute",
      "https://scontrinozero.it/help/contatto-assistenza",
      "https://scontrinozero.it/help/pos-rt-obbligo",
      "https://scontrinozero.it/help/intestazione-scontrino",
    ];
    for (const url of expectedHelpArticles) {
      expect(helpUrls).toContain(url);
    }

    // Auth pages (last two)
    expect(result[31]).toMatchObject({
      url: "https://scontrinozero.it/login",
      changeFrequency: "yearly",
      priority: 0.5,
    });
    expect(result[32]).toMatchObject({
      url: "https://scontrinozero.it/register",
      changeFrequency: "yearly",
      priority: 0.5,
    });
  });

  it("uses NEXT_PUBLIC_APP_URL when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://test.scontrinozero.it");

    vi.resetModules();
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result[0].url).toBe("https://test.scontrinozero.it");
    expect(result[1].url).toBe("https://test.scontrinozero.it/prezzi");
    expect(result[2].url).toBe("https://test.scontrinozero.it/funzionalita");
    expect(result[3].url).toBe("https://test.scontrinozero.it/privacy");
    expect(result[9].url).toBe("https://test.scontrinozero.it/help");

    vi.unstubAllEnvs();
  });

  it("includes lastModified as Date for all entries", async () => {
    vi.resetModules();
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    for (const entry of result) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
