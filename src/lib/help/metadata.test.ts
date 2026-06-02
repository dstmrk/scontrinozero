import { describe, it, expect } from "vitest";
import { helpArticleMetadata } from "./metadata";
import { getHelpArticle, helpSlugs } from "./articles";

describe("helpArticleMetadata", () => {
  it("uses the article metaTitle as document title", () => {
    const article = getHelpArticle("regime-forfettario");
    const meta = helpArticleMetadata("regime-forfettario");
    expect(meta.title).toBe(article.metaTitle);
  });

  it("uses the article description", () => {
    const article = getHelpArticle("aliquote-iva");
    const meta = helpArticleMetadata("aliquote-iva");
    expect(meta.description).toBe(article.description);
  });

  it("sets a self-referential canonical under /help", () => {
    const meta = helpArticleMetadata("primo-scontrino");
    expect(meta.alternates?.canonical).toBe(
      "https://scontrinozero.it/help/primo-scontrino",
    );
  });

  it("mirrors title/description/url into Open Graph", () => {
    const article = getHelpArticle("come-collegare-ade");
    const meta = helpArticleMetadata("come-collegare-ade");
    expect(meta.openGraph?.title).toBe(article.metaTitle);
    expect(meta.openGraph?.description).toBe(article.description);
    expect(meta.openGraph).toMatchObject({
      url: "https://scontrinozero.it/help/come-collegare-ade",
    });
  });

  it("produces canonical + openGraph for every help slug", () => {
    for (const slug of helpSlugs) {
      const meta = helpArticleMetadata(slug);
      expect(meta.alternates?.canonical).toBe(
        `https://scontrinozero.it/help/${slug}`,
      );
      expect(meta.openGraph).toBeDefined();
    }
  });

  it("throws on an unknown slug", () => {
    expect(() => helpArticleMetadata("does-not-exist")).toThrow();
  });
});
