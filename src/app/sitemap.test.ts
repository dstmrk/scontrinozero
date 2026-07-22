import { describe, expect, it, vi } from "vitest";
import { helpSlugs } from "@/lib/help/articles";

describe("sitemap", () => {
  it("returns all pages with correct structure", async () => {
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result).toHaveLength(69);

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

    // Category landing pages
    const allUrls = result.map((e) => e.url);
    const expectedCategoryUrls = [
      "https://scontrinozero.it/per/ambulanti",
      "https://scontrinozero.it/per/parrucchieri-estetisti",
      "https://scontrinozero.it/per/artigiani",
      "https://scontrinozero.it/per/b-and-b",
      "https://scontrinozero.it/per/regime-forfettario",
      "https://scontrinozero.it/per/professionisti",
      "https://scontrinozero.it/per/officine-meccanici",
      "https://scontrinozero.it/per/eventi-mercatini-hobbisti",
      "https://scontrinozero.it/per/palestre-personal-trainer",
      "https://scontrinozero.it/per/food-truck",
      "https://scontrinozero.it/per/ncc-taxi",
      "https://scontrinozero.it/per/tatuatori-piercer",
    ];
    for (const url of expectedCategoryUrls) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }

    // Comparison page (consolidated)
    expect(allUrls).toContain("https://scontrinozero.it/confronto");
    const confrontoEntry = result.find(
      (e) => e.url === "https://scontrinozero.it/confronto",
    );
    expect(confrontoEntry).toMatchObject({
      changeFrequency: "monthly",
      priority: 0.7,
    });

    // I tre vecchi URL non devono più essere in sitemap (ora sono 301 → /confronto)
    expect(allUrls).not.toContain(
      "https://scontrinozero.it/confronto/registratore-telematico",
    );
    expect(allUrls).not.toContain(
      "https://scontrinozero.it/confronto/scontrinare",
    );
    expect(allUrls).not.toContain(
      "https://scontrinozero.it/confronto/fatture-in-cloud",
    );

    // Strumenti hub (inserted before the individual tool pages)
    expect(allUrls).toContain("https://scontrinozero.it/strumenti");
    const strumentiHubEntry = result.find(
      (e) => e.url === "https://scontrinozero.it/strumenti",
    );
    expect(strumentiHubEntry).toMatchObject({
      changeFrequency: "monthly",
      priority: 0.6,
    });

    // Tool pages
    const expectedToolUrls = [
      "https://scontrinozero.it/strumenti/scorporo-iva",
      "https://scontrinozero.it/strumenti/verifica-codice-lotteria",
      "https://scontrinozero.it/strumenti/calcolatore-risparmio-rt",
      "https://scontrinozero.it/strumenti/dicitura-regime-forfettario",
    ];
    for (const url of expectedToolUrls) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }

    // Guide hub + articles
    expect(allUrls).toContain("https://scontrinozero.it/guide");
    const expectedGuideUrls = [
      "https://scontrinozero.it/guide/documento-commerciale-online",
      "https://scontrinozero.it/guide/scontrino-senza-registratore-di-cassa",
      "https://scontrinozero.it/guide/differenza-scontrino-ricevuta-fattura",
      "https://scontrinozero.it/guide/pos-rt-obbligo-2026",
      "https://scontrinozero.it/guide/scontrino-regime-forfettario",
      "https://scontrinozero.it/guide/migrare-da-registratore-telematico-a-software",
      "https://scontrinozero.it/guide/chiusura-giornaliera-corrispettivi",
      "https://scontrinozero.it/guide/annullare-scontrino-elettronico",
      "https://scontrinozero.it/guide/lotteria-scontrini-commerciante",
      "https://scontrinozero.it/guide/scegliere-software-scontrini-elettronici",
      "https://scontrinozero.it/guide/codici-natura-iva",
      "https://scontrinozero.it/guide/stampante-termica-wifi-scontrini",
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
    expect(result[35]).toMatchObject({
      url: "https://scontrinozero.it/privacy",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[36]).toMatchObject({
      url: "https://scontrinozero.it/privacy/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[37]).toMatchObject({
      url: "https://scontrinozero.it/termini",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[38]).toMatchObject({
      url: "https://scontrinozero.it/termini/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[39]).toMatchObject({
      url: "https://scontrinozero.it/cookie-policy",
      changeFrequency: "yearly",
      priority: 0.3,
    });
    expect(result[40]).toMatchObject({
      url: "https://scontrinozero.it/cookie-policy/v01",
      changeFrequency: "yearly",
      priority: 0.3,
    });

    // Help center hub
    expect(result[41]).toMatchObject({
      url: "https://scontrinozero.it/help",
      changeFrequency: "monthly",
      priority: 0.6,
    });

    // Help articles — derivati da helpSlugs (unica fonte di verità, anti-drift):
    // ogni articolo definito in helpArticles deve comparire in sitemap.
    const helpArticleUrls = allUrls.filter((u) =>
      u.startsWith("https://scontrinozero.it/help/"),
    );
    expect(helpArticleUrls).toHaveLength(helpSlugs.length);
    for (const slug of helpSlugs) {
      expect(allUrls).toContain(`https://scontrinozero.it/help/${slug}`);
    }

    // Per index hub (inserted before category landings)
    expect(allUrls).toContain("https://scontrinozero.it/per");
    const perIndexEntry = result.find(
      (e) => e.url === "https://scontrinozero.it/per",
    );
    expect(perIndexEntry).toMatchObject({
      changeFrequency: "monthly",
      priority: 0.7,
    });

    // Pagine auth: thin content, escluse dalla sitemap (restano raggiungibili
    // e indicizzabili, ma non le pubblicizziamo ai crawler).
    expect(allUrls).not.toContain("https://scontrinozero.it/login");
    expect(allUrls).not.toContain("https://scontrinozero.it/register");
  });

  it("derives the base from NEXT_PUBLIC_MARKETING_HOSTNAME (marketing apex, not the app domain)", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_HOSTNAME", "test.scontrinozero.it");

    vi.resetModules();
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result[0].url).toBe("https://test.scontrinozero.it");
    expect(result[1].url).toBe("https://test.scontrinozero.it/prezzi");
    expect(result[2].url).toBe("https://test.scontrinozero.it/funzionalita");
    expect(result[3].url).toBe("https://test.scontrinozero.it/per");
    expect(result[4].url).toBe("https://test.scontrinozero.it/per/ambulanti");
    expect(result[16].url).toBe("https://test.scontrinozero.it/confronto");
    expect(result[17].url).toBe("https://test.scontrinozero.it/strumenti");
    expect(result[18].url).toBe(
      "https://test.scontrinozero.it/strumenti/scorporo-iva",
    );
    expect(result[22].url).toBe("https://test.scontrinozero.it/guide");
    expect(result[23].url).toBe(
      "https://test.scontrinozero.it/guide/documento-commerciale-online",
    );
    expect(result[35].url).toBe("https://test.scontrinozero.it/privacy");
    expect(result[41].url).toBe("https://test.scontrinozero.it/help");

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

  it("uses the real registry dates as lastModified (not the build time)", async () => {
    vi.resetModules();
    const { default: sitemap } = await import("./sitemap");
    const { guideArticles, guideSlugs } = await import("@/lib/guide/articles");
    const { helpArticles } = await import("@/lib/help/articles");
    const { confrontoContent } = await import("@/lib/confronto/comparisons");
    const result = sitemap();
    const byUrl = new Map(result.map((e) => [e.url, e]));
    const isoOf = (d: unknown) =>
      (d as Date).toISOString().slice(0, "YYYY-MM-DD".length);

    // Guide: updatedAt del registry
    for (const slug of guideSlugs) {
      const entry = byUrl.get(`https://scontrinozero.it/guide/${slug}`);
      expect(isoOf(entry?.lastModified)).toBe(guideArticles[slug].updatedAt);
    }

    // Help: dateModified del registry
    for (const [slug, article] of Object.entries(helpArticles)) {
      const entry = byUrl.get(`https://scontrinozero.it/help/${slug}`);
      expect(isoOf(entry?.lastModified)).toBe(article.dateModified);
    }

    // Confronto: lastUpdated del registry
    const confronto = byUrl.get("https://scontrinozero.it/confronto");
    expect(isoOf(confronto?.lastModified)).toBe(confrontoContent.lastUpdated);

    // Hub: max delle date figlie
    const guideHub = byUrl.get("https://scontrinozero.it/guide");
    const maxGuideDate = guideSlugs
      .map((s) => guideArticles[s].updatedAt)
      .toSorted((a, b) => a.localeCompare(b))
      .at(-1);
    expect(isoOf(guideHub?.lastModified)).toBe(maxGuideDate);

    const helpHub = byUrl.get("https://scontrinozero.it/help");
    const maxHelpDate = Object.values(helpArticles)
      .map((a) => a.dateModified)
      .toSorted((a, b) => a.localeCompare(b))
      .at(-1);
    expect(isoOf(helpHub?.lastModified)).toBe(maxHelpDate);
  });
});
