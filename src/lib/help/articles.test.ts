import { describe, it, expect } from "vitest";
import {
  helpArticles,
  helpSlugs,
  getRelatedArticles,
  getHelpArticle,
} from "./articles";

describe("helpArticles registry", () => {
  it("contains at least 22 entries", () => {
    expect(Object.keys(helpArticles).length).toBeGreaterThanOrEqual(22);
  });

  it("each entry's key matches its slug", () => {
    for (const [key, article] of Object.entries(helpArticles)) {
      expect(article.slug).toBe(key);
    }
  });

  it("each entry has non-empty title and slug", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.slug.length).toBeGreaterThan(0);
      expect(article.title.length).toBeGreaterThan(0);
    }
  });

  it("each entry has a non-empty description", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("each entry has a non-empty metaTitle", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.metaTitle.trim().length).toBeGreaterThan(0);
    }
  });

  it("no metaTitle hardcodes the brand suffix (added by the root template)", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.metaTitle).not.toMatch(/\| ScontrinoZero/);
    }
  });

  // Il title degli articoli help è assoluto (helpArticleMetadata), quindi il
  // metaTitle è per intero ciò che Google rende: oltre i ~60 caratteri viene
  // troncato e la coda della keyword si perde.
  it("each metaTitle fits the SERP budget (≤ 60 chars)", () => {
    for (const article of Object.values(helpArticles)) {
      expect(
        article.metaTitle.length,
        `help ${article.slug}: "${article.metaTitle}"`,
      ).toBeLessThanOrEqual(60);
    }
  });

  it("each title fits the Article headline limit (≤ 110 chars)", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.title.length).toBeLessThanOrEqual(110);
    }
  });

  it("each entry has exactly 3 related slugs", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.related).toHaveLength(3);
    }
  });

  it("no entry references itself in related", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.related).not.toContain(article.slug);
    }
  });

  it("every related slug exists in the registry", () => {
    for (const article of Object.values(helpArticles)) {
      for (const relSlug of article.related) {
        expect(helpArticles[relSlug]).toBeDefined();
      }
    }
  });

  it("related slugs within one entry are unique", () => {
    for (const article of Object.values(helpArticles)) {
      const unique = new Set(article.related);
      expect(unique.size).toBe(article.related.length);
    }
  });
});

describe("numero-documento-azzeramento (batch D — query GSC senza pagina)", () => {
  const article = helpArticles["numero-documento-azzeramento"];

  it("exists in the registry", () => {
    expect(article).toBeDefined();
  });

  it("targets the 'numero azzeramento' query in the metaTitle", () => {
    expect(article.metaTitle.toLowerCase()).toContain("azzeramento");
  });

  it("mentions the documento commerciale online angle in the description", () => {
    expect(article.description.toLowerCase()).toContain(
      "documento commerciale online",
    );
  });

  it("links the daily-closure and void cluster", () => {
    expect(article.related).toContain("chiusura-giornaliera");
    expect(article.related).toContain("annullare-scontrino");
  });
});

describe("analytics-e-report (KPI, grafici e gating Pro)", () => {
  const article = helpArticles["analytics-e-report"];

  it("exists in the registry", () => {
    expect(article).toBeDefined();
  });

  it("targets the analytics query in the metaTitle", () => {
    expect(article.metaTitle.toLowerCase()).toContain("analytics");
  });

  it("segnala il gating Pro nella description (niente promesse fuori piano)", () => {
    expect(article.description).toContain("Pro");
  });

  it("links the storico and pricing cluster", () => {
    expect(article.related).toContain("storico-ed-esportazione");
    expect(article.related).toContain("piani-e-prezzi");
  });
});

describe("metodi-di-pagamento (bonifico e assegno sullo scontrino)", () => {
  const article = helpArticles["metodi-di-pagamento"];

  it("exists in the registry", () => {
    expect(article).toBeDefined();
  });

  it("targets the 'bonifico' query in the metaTitle", () => {
    expect(article.metaTitle.toLowerCase()).toContain("bonifico");
  });

  it("names both the bonifico and the assegno case in the description", () => {
    const description = article.description.toLowerCase();
    expect(description).toContain("bonifico");
    expect(description).toContain("assegno");
  });

  it("links the payment cluster", () => {
    expect(article.related).toContain("aliquote-iva");
    expect(article.related).toContain("primo-scontrino");
  });
});

describe("aliquote-iva does not cannibalise metodi-di-pagamento", () => {
  const article = helpArticles["aliquote-iva"];

  it("no longer claims the payment-methods intent in the metaTitle", () => {
    expect(article.metaTitle.toLowerCase()).not.toContain(
      "metodi di pagamento",
    );
  });

  it("keeps the VAT intent in the metaTitle", () => {
    expect(article.metaTitle.toLowerCase()).toContain("iva");
  });

  it("points at the dedicated payment article through related", () => {
    expect(article.related).toContain("metodi-di-pagamento");
  });
});

describe("normativa-pos-2026 non si confonde con pos-rt-obbligo", () => {
  const normativa = helpArticles["normativa-pos-2026"];
  const posRt = helpArticles["pos-rt-obbligo"];

  it("keeps the 'normativa POS 2026' intent in the title (anchor text dell'hub)", () => {
    expect(normativa.title.toLowerCase()).toContain("normativa pos 2026");
  });

  it("does not open with the same word as pos-rt-obbligo", () => {
    // Le due voci sono adiacenti nella categoria "POS e normativa" dell'hub:
    // con lo stesso incipit ("Collegamento POS-…") si leggono come lo stesso
    // articolo scritto due volte.
    expect(normativa.title).not.toBe(posRt.title);
    const firstWord = (title: string) => title.split(" ")[0].toLowerCase();
    expect(firstWord(normativa.title)).not.toBe(firstWord(posRt.title));
  });

  it("cross-links pos-rt-obbligo through related", () => {
    expect(normativa.related).toContain("pos-rt-obbligo");
    expect(posRt.related).toContain("normativa-pos-2026");
  });
});

describe("per-article dates", () => {
  it("every article has datePublished and dateModified in ISO YYYY-MM-DD form", () => {
    for (const article of Object.values(helpArticles)) {
      expect(article.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(article.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every date is a real, parseable calendar date", () => {
    for (const article of Object.values(helpArticles)) {
      expect(Number.isNaN(Date.parse(article.datePublished))).toBe(false);
      expect(Number.isNaN(Date.parse(article.dateModified))).toBe(false);
    }
  });

  it("dateModified is never before datePublished", () => {
    for (const article of Object.values(helpArticles)) {
      // Confronto lessicografico: valido per date ISO
      expect(
        article.dateModified >= article.datePublished,
        `${article.slug}: ${article.dateModified} < ${article.datePublished}`,
      ).toBe(true);
    }
  });
});

describe("helpSlugs", () => {
  it("mirrors the keys of helpArticles in insertion order", () => {
    expect(helpSlugs).toEqual(Object.keys(helpArticles));
  });

  it("has no duplicate slugs", () => {
    expect(new Set(helpSlugs).size).toBe(helpSlugs.length);
  });

  it("every slug resolves to an article whose key matches", () => {
    for (const slug of helpSlugs) {
      expect(getHelpArticle(slug).slug).toBe(slug);
    }
  });
});

describe("getRelatedArticles", () => {
  it("returns 3 HelpArticle objects for a known slug", () => {
    const result = getRelatedArticles("aliquote-iva");
    expect(result).toHaveLength(3);
    for (const article of result) {
      expect(article.title).toBeTruthy();
      expect(article.slug).toBeTruthy();
    }
  });

  it("returned articles correspond to the registry's related slugs", () => {
    const result = getRelatedArticles("primo-scontrino");
    const expected = helpArticles["primo-scontrino"].related;
    expect(result.map((a) => a.slug)).toEqual([...expected]);
  });

  it("throws on unknown slug", () => {
    expect(() => getRelatedArticles("does-not-exist")).toThrow();
  });
});

describe("getHelpArticle", () => {
  it("returns the entry for a known slug", () => {
    const article = getHelpArticle("regime-forfettario");
    expect(article.slug).toBe("regime-forfettario");
  });

  it("throws on unknown slug", () => {
    expect(() => getHelpArticle("nope")).toThrow();
  });
});
