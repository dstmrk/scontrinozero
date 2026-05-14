import { describe, expect, it } from "vitest";
import {
  categories,
  categorySlugs,
  getCategory,
  isCategorySlug,
} from "./categories";

describe("categorySlugs", () => {
  it("contains exactly 6 slugs", () => {
    expect(categorySlugs).toHaveLength(6);
  });

  it("contains the expected slugs", () => {
    expect(categorySlugs).toEqual(
      expect.arrayContaining([
        "ambulanti",
        "parrucchieri-estetisti",
        "artigiani",
        "b-and-b",
        "regime-forfettario",
        "professionisti",
      ]),
    );
  });

  it("has unique entries", () => {
    expect(new Set(categorySlugs).size).toBe(categorySlugs.length);
  });
});

describe("categories dictionary", () => {
  for (const slug of [
    "ambulanti",
    "parrucchieri-estetisti",
    "artigiani",
    "b-and-b",
    "regime-forfettario",
    "professionisti",
  ] as const) {
    describe(slug, () => {
      const c = categories[slug];

      it("has matching slug", () => {
        expect(c.slug).toBe(slug);
      });

      it("has non-empty title (under 70 chars)", () => {
        expect(c.title.length).toBeGreaterThan(5);
        expect(c.title.length).toBeLessThanOrEqual(70);
      });

      it("has metaTitle 30–70 chars", () => {
        expect(c.metaTitle.length).toBeGreaterThanOrEqual(30);
        expect(c.metaTitle.length).toBeLessThanOrEqual(70);
      });

      it("has metaDescription 80–170 chars", () => {
        expect(c.metaDescription.length).toBeGreaterThanOrEqual(80);
        expect(c.metaDescription.length).toBeLessThanOrEqual(170);
      });

      it("has a non-empty heroSubtitle", () => {
        expect(c.heroSubtitle.length).toBeGreaterThan(20);
      });

      it("has a non-empty audience", () => {
        expect(c.audience.length).toBeGreaterThan(0);
      });

      it("has a useCase paragraph", () => {
        expect(c.useCase.length).toBeGreaterThan(50);
      });

      it("has at least 3 obligations", () => {
        expect(c.obligations.length).toBeGreaterThanOrEqual(3);
        for (const item of c.obligations) {
          expect(item.length).toBeGreaterThan(10);
        }
      });

      it("has at least 3 benefits", () => {
        expect(c.benefits.length).toBeGreaterThanOrEqual(3);
        for (const item of c.benefits) {
          expect(item.length).toBeGreaterThan(10);
        }
      });

      it("has exactly 3 FAQ entries with question + answer", () => {
        expect(c.faq).toHaveLength(3);
        for (const item of c.faq) {
          expect(item.question.length).toBeGreaterThan(10);
          expect(item.answer.length).toBeGreaterThan(20);
        }
      });

      it("has exactly 3 related help article slugs", () => {
        expect(c.relatedHelp).toHaveLength(3);
        for (const helpSlug of c.relatedHelp) {
          expect(typeof helpSlug).toBe("string");
          expect(helpSlug.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("getCategory", () => {
  it("returns the category for a known slug", () => {
    const c = getCategory("ambulanti");
    expect(c.slug).toBe("ambulanti");
  });

  it("throws for an unknown slug", () => {
    expect(() => getCategory("unknown-slug")).toThrow();
  });

  it("throws for an empty slug", () => {
    expect(() => getCategory("")).toThrow();
  });

  it("throws for prototype-chain keys (e.g. __proto__, constructor)", () => {
    expect(() => getCategory("__proto__")).toThrow();
    expect(() => getCategory("constructor")).toThrow();
    expect(() => getCategory("toString")).toThrow();
    expect(() => getCategory("hasOwnProperty")).toThrow();
  });
});

describe("isCategorySlug", () => {
  it("returns true for known slugs", () => {
    for (const slug of categorySlugs) {
      expect(isCategorySlug(slug)).toBe(true);
    }
  });

  it("returns false for unknown slugs", () => {
    expect(isCategorySlug("unknown")).toBe(false);
    expect(isCategorySlug("")).toBe(false);
  });

  it("returns false for prototype-chain keys", () => {
    expect(isCategorySlug("__proto__")).toBe(false);
    expect(isCategorySlug("constructor")).toBe(false);
    expect(isCategorySlug("toString")).toBe(false);
    expect(isCategorySlug("hasOwnProperty")).toBe(false);
  });
});

describe("relatedHelp slugs point to real help articles", () => {
  it("each related help slug exists in the help articles dictionary", async () => {
    const { helpArticles } = await import("@/lib/help/articles");
    for (const slug of categorySlugs) {
      const c = categories[slug];
      for (const helpSlug of c.relatedHelp) {
        expect(
          Object.keys(helpArticles),
          `category ${slug}: helpSlug ${helpSlug}`,
        ).toContain(helpSlug);
      }
    }
  });
});
