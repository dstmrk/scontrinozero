import { describe, it, expect } from "vitest";
import { helpArticles, helpSlugs } from "./articles";
import {
  helpHubCategories,
  helpHubFeaturedSlugs,
  resolveHubArticle,
} from "./hub-categories";

const allRefs = helpHubCategories.flatMap((category) => category.articles);

describe("helpHubCategories", () => {
  it("references only slugs that exist in the registry", () => {
    for (const ref of allRefs) {
      expect(
        helpArticles[ref.slug],
        `slug sconosciuto: ${ref.slug}`,
      ).toBeDefined();
    }
  });

  it("covers every article of the registry (nessun orfano)", () => {
    const covered = new Set(allRefs.map((ref) => ref.slug));
    const missing = helpSlugs.filter((slug) => !covered.has(slug));
    expect(
      missing,
      `articoli non raggiungibili dall'hub /help: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("has no duplicate entry inside the same category", () => {
    for (const category of helpHubCategories) {
      const hrefs = category.articles.map((ref) => resolveHubArticle(ref).href);
      expect(new Set(hrefs).size, `duplicati in ${category.name}`).toBe(
        hrefs.length,
      );
    }
  });

  it("gives every category a name and a description", () => {
    for (const category of helpHubCategories) {
      expect(category.name.trim().length).toBeGreaterThan(0);
      expect(category.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("points categoryHref at an existing article when set", () => {
    for (const category of helpHubCategories) {
      if (category.categoryHref) {
        expect(category.categoryHref).toMatch(/^\/help\/[a-z0-9-]+$/);
        const slug = category.categoryHref.replace("/help/", "");
        expect(helpArticles[slug]).toBeDefined();
      }
    }
  });
});

describe("helpHubFeaturedSlugs", () => {
  it("references only slugs that exist in the registry", () => {
    for (const slug of helpHubFeaturedSlugs) {
      expect(helpArticles[slug], `slug sconosciuto: ${slug}`).toBeDefined();
    }
  });

  it("has no duplicates", () => {
    expect(new Set(helpHubFeaturedSlugs).size).toBe(
      helpHubFeaturedSlugs.length,
    );
  });
});

describe("resolveHubArticle", () => {
  it("derives title and href from the registry", () => {
    const article = helpArticles["aliquote-iva"];
    expect(resolveHubArticle({ slug: "aliquote-iva" })).toEqual({
      title: article.title,
      href: "/help/aliquote-iva",
    });
  });

  it("uses the section label and anchor for a sectioned entry", () => {
    expect(
      resolveHubArticle({
        slug: "api",
        section: { id: "endpoint", label: "Endpoint REST" },
      }),
    ).toEqual({
      title: "Endpoint REST",
      href: "/help/api#endpoint",
    });
  });

  it("throws on a slug missing from the registry", () => {
    expect(() => resolveHubArticle({ slug: "does-not-exist" })).toThrow(
      /does-not-exist/,
    );
  });

  it("never returns a stale title: ogni voce risolta combacia col registry", () => {
    for (const ref of allRefs) {
      const resolved = resolveHubArticle(ref);
      if (!ref.section) {
        expect(resolved.title).toBe(helpArticles[ref.slug].title);
      }
      expect(resolved.href.startsWith(`/help/${ref.slug}`)).toBe(true);
    }
  });
});
