import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { categorySlugs } from "@/lib/per/categories";
import { guideSlugs } from "@/lib/guide/articles";
import { helpSlugs } from "@/lib/help/articles";
import { toolSlugs } from "@/lib/strumenti/tools";

describe("sitemap", () => {
  // sitemap.ts calcola la base URL all'import: ogni test parte da un modulo
  // fresco, e l'env stubbato da un test non deve sopravvivergli. Senza questi
  // hook il risultato dipendeva dall'ordine dei test (sequence.shuffle).
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns all pages with correct structure", async () => {
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    // Nessun URL ripetuto: un contenuto in due registry finirebbe due volte.
    const allUrls = result.map((e) => e.url);
    expect(new Set(allUrls).size).toBe(allUrls.length);

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
    // Ogni categoria del registry ha la sua landing in sitemap.
    for (const url of categorySlugs.map(
      (slug) => `https://scontrinozero.it/per/${slug}`,
    )) {
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
    for (const url of toolSlugs.map(
      (slug) => `https://scontrinozero.it/strumenti/${slug}`,
    )) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }

    // Guide hub + articles
    expect(allUrls).toContain("https://scontrinozero.it/guide");
    for (const url of guideSlugs.map(
      (slug) => `https://scontrinozero.it/guide/${slug}`,
    )) {
      expect(allUrls).toContain(url);
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }

    // Legal (lookup per URL: gli indici scorrono a ogni nuovo contenuto)
    const legalUrls = [
      "https://scontrinozero.it/privacy",
      "https://scontrinozero.it/privacy/v01",
      "https://scontrinozero.it/privacy/v02",
      "https://scontrinozero.it/termini",
      "https://scontrinozero.it/termini/v01",
      "https://scontrinozero.it/cookie-policy",
      "https://scontrinozero.it/cookie-policy/v01",
      "https://scontrinozero.it/condizioni-collaboratori",
      "https://scontrinozero.it/condizioni-collaboratori/v01",
    ];
    for (const url of legalUrls) {
      const entry = result.find((e) => e.url === url);
      expect(entry).toMatchObject({
        changeFrequency: "yearly",
        priority: 0.3,
      });
    }
    // Pubblicate dopo gli altri documenti legali: data propria.
    expect(
      result.find(
        (e) =>
          e.url === "https://scontrinozero.it/condizioni-collaboratori/v01",
      )?.lastModified,
    ).toEqual(new Date("2026-10-24"));
    // La v02 sposta la data di /privacy; la v01 tiene la sua.
    const privacyDate = (url: string) =>
      result.find((e) => e.url === url)?.lastModified;
    expect(privacyDate("https://scontrinozero.it/privacy")).toEqual(
      new Date("2026-10-28"),
    );
    expect(privacyDate("https://scontrinozero.it/privacy/v02")).toEqual(
      new Date("2026-10-28"),
    );
    expect(privacyDate("https://scontrinozero.it/privacy/v01")).toEqual(
      new Date("2026-07-12"),
    );

    // Help center hub
    const helpHubEntry = result.find(
      (e) => e.url === "https://scontrinozero.it/help",
    );
    expect(helpHubEntry).toMatchObject({
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

    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    expect(result[0].url).toBe("https://test.scontrinozero.it");
    expect(result[1].url).toBe("https://test.scontrinozero.it/prezzi");
    expect(result[2].url).toBe("https://test.scontrinozero.it/funzionalita");
    expect(result[3].url).toBe("https://test.scontrinozero.it/per");
    // Il resto per presenza (gli indici scorrono a ogni nuovo contenuto)
    const urls = result.map((e) => e.url);
    for (const path of [
      "/per/ambulanti",
      "/confronto",
      "/strumenti",
      "/strumenti/scorporo-iva",
      "/guide",
      "/guide/scontrino-senza-registratore-di-cassa",
      "/privacy",
      "/help",
    ]) {
      expect(urls).toContain(`https://test.scontrinozero.it${path}`);
    }
  });

  it("includes lastModified as Date for all entries", async () => {
    const { default: sitemap } = await import("./sitemap");
    const result = sitemap();

    for (const entry of result) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it("uses the real registry dates as lastModified (not the build time)", async () => {
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
