import { describe, it, expect } from "vitest";
import { helpArticles, getRelatedArticles, getHelpArticle } from "./articles";

describe("helpArticles registry", () => {
  it("contains at least 21 entries", () => {
    expect(Object.keys(helpArticles).length).toBeGreaterThanOrEqual(21);
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
