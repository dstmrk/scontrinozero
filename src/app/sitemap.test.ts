import { describe, expect, it, vi } from "vitest";

describe("sitemap", () => {
  it("returns all pages with correct structure", async () => {
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result).toHaveLength(51);

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

    // Category landing pages (v1.2.9)
    const allUrls = result.map((e) => e.url);
    const expectedCategoryUrls = [
      "https://scontrinozero.it/per/ambulanti",
      "https://scontrinozero.it/per/parrucchieri-estetisti",
      "https://scontrinozero.it/per/artigiani",
      "https://scontrinozero.it/per/b-and-b",
      "https://scontrinozero.it/per/regime-forfettario",
      "https://scontrinozero.it/per/professionisti",
    ];
    for (const url of expectedCategoryUrls) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }

    // Comparison pages (v1.2.11)
    const expectedComparisonUrls = [
      "https://scontrinozero.it/confronto/registratore-telematico",
      "https://scontrinozero.it/confronto/scontrinare",
      "https://scontrinozero.it/confronto/fatture-in-cloud",
    ];
    for (const url of expectedComparisonUrls) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.65,
      });
    }

    // Tool pages (v1.2.12)
    const expectedToolUrls = [
      "https://scontrinozero.it/strumenti/scorporo-iva",
      "https://scontrinozero.it/strumenti/verifica-codice-lotteria",
      "https://scontrinozero.it/strumenti/calcolatore-risparmio-rt",
    ];
    for (const url of expectedToolUrls) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }

    // Guide hub + articles (v1.2.13)
    expect(allUrls).toContain("https://scontrinozero.it/guide");
    const expectedGuideUrls = [
      "https://scontrinozero.it/guide/documento-commerciale-online",
      "https://scontrinozero.it/guide/scontrino-senza-registratore-di-cassa",
      "https://scontrinozero.it/guide/differenza-scontrino-ricevuta-fattura",
      "https://scontrinozero.it/guide/pos-rt-obbligo-2026",
      "https://scontrinozero.it/guide/scontrino-regime-forfettario",
    ];
    for (const url of expectedGuideUrls) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }

    // Legal
    expect(result[21]).toMatchObject({
      url: "https://scontrinozero.it/privacy",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[22]).toMatchObject({
      url: "https://scontrinozero.it/privacy/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[23]).toMatchObject({
      url: "https://scontrinozero.it/termini",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[24]).toMatchObject({
      url: "https://scontrinozero.it/termini/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[25]).toMatchObject({
      url: "https://scontrinozero.it/cookie-policy",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[26]).toMatchObject({
      url: "https://scontrinozero.it/cookie-policy/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });

    // Help center hub
    expect(result[27]).toMatchObject({
      url: "https://scontrinozero.it/help",
      changeFrequency: "monthly",
      priority: 0.6,
    });

    // Help articles — verify all 21 are present (order may change as articles are added)
    const helpUrls = allUrls;
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
    expect(result[49]).toMatchObject({
      url: "https://scontrinozero.it/login",
      changeFrequency: "yearly",
      priority: 0.5,
    });
    expect(result[50]).toMatchObject({
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
    expect(result[3].url).toBe("https://test.scontrinozero.it/per/ambulanti");
    expect(result[9].url).toBe(
      "https://test.scontrinozero.it/confronto/registratore-telematico",
    );
    expect(result[12].url).toBe(
      "https://test.scontrinozero.it/strumenti/scorporo-iva",
    );
    expect(result[15].url).toBe("https://test.scontrinozero.it/guide");
    expect(result[16].url).toBe(
      "https://test.scontrinozero.it/guide/documento-commerciale-online",
    );
    expect(result[21].url).toBe("https://test.scontrinozero.it/privacy");
    expect(result[27].url).toBe("https://test.scontrinozero.it/help");

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
