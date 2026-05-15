import { describe, expect, it } from "vitest";
import { getGuide, guideArticles, guideSlugs, isGuideSlug } from "./articles";

describe("guideSlugs", () => {
  it("contains exactly 5 slugs", () => {
    expect(guideSlugs).toHaveLength(5);
  });

  it("contains the expected slugs", () => {
    expect(guideSlugs).toEqual(
      expect.arrayContaining([
        "documento-commerciale-online",
        "scontrino-senza-registratore-di-cassa",
        "differenza-scontrino-ricevuta-fattura",
        "pos-rt-obbligo-2026",
        "scontrino-regime-forfettario",
      ]),
    );
  });

  it("has unique entries", () => {
    expect(new Set(guideSlugs).size).toBe(guideSlugs.length);
  });
});

describe("guideArticles dictionary", () => {
  for (const slug of guideSlugs) {
    describe(slug, () => {
      const a = guideArticles[slug];

      it("has matching slug", () => {
        expect(a.slug).toBe(slug);
      });

      it("has non-empty title (under 70 chars)", () => {
        expect(a.title.length).toBeGreaterThan(5);
        expect(a.title.length).toBeLessThanOrEqual(70);
      });

      it("has metaTitle 30-70 chars", () => {
        expect(a.metaTitle.length).toBeGreaterThanOrEqual(30);
        expect(a.metaTitle.length).toBeLessThanOrEqual(70);
      });

      it("has metaDescription 80-170 chars", () => {
        expect(a.metaDescription.length).toBeGreaterThanOrEqual(80);
        expect(a.metaDescription.length).toBeLessThanOrEqual(170);
      });

      it("has heroIntro at least 80 chars", () => {
        expect(a.heroIntro.length).toBeGreaterThanOrEqual(80);
      });

      it("has publishedAt in YYYY-MM-DD format", () => {
        expect(a.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it("has updatedAt in YYYY-MM format", () => {
        expect(a.updatedAt).toMatch(/^\d{4}-\d{2}$/);
      });

      it("has positive readingMinutes", () => {
        expect(a.readingMinutes).toBeGreaterThan(0);
        expect(Number.isInteger(a.readingMinutes)).toBe(true);
      });

      it("has 4-8 sections, each with non-empty heading and body", () => {
        expect(a.sections.length).toBeGreaterThanOrEqual(4);
        expect(a.sections.length).toBeLessThanOrEqual(8);
        for (const section of a.sections) {
          expect(section.heading.length).toBeGreaterThan(2);
          expect(section.body.length).toBeGreaterThanOrEqual(50);
        }
      });

      it("has at least 3 FAQ entries with substantive question/answer", () => {
        expect(a.faq.length).toBeGreaterThanOrEqual(3);
        for (const item of a.faq) {
          expect(item.question.length).toBeGreaterThan(10);
          expect(item.answer.length).toBeGreaterThan(30);
        }
      });

      it("has 2-4 relatedHelp slugs", () => {
        expect(a.relatedHelp.length).toBeGreaterThanOrEqual(2);
        expect(a.relatedHelp.length).toBeLessThanOrEqual(4);
        for (const helpSlug of a.relatedHelp) {
          expect(typeof helpSlug).toBe("string");
          expect(helpSlug.length).toBeGreaterThan(0);
        }
      });

      it("has 2-3 relatedGuides slugs, excluding self", () => {
        expect(a.relatedGuides.length).toBeGreaterThanOrEqual(2);
        expect(a.relatedGuides.length).toBeLessThanOrEqual(3);
        expect(a.relatedGuides).not.toContain(slug);
        for (const guideSlug of a.relatedGuides) {
          expect(guideSlugs).toContain(guideSlug);
        }
      });
    });
  }
});

describe("getGuide", () => {
  it("returns the guide for a known slug", () => {
    const a = getGuide("documento-commerciale-online");
    expect(a.slug).toBe("documento-commerciale-online");
  });

  it("throws for an unknown slug", () => {
    expect(() => getGuide("unknown-slug")).toThrow();
  });

  it("throws for an empty slug", () => {
    expect(() => getGuide("")).toThrow();
  });

  it("throws for prototype-chain keys", () => {
    expect(() => getGuide("__proto__")).toThrow();
    expect(() => getGuide("constructor")).toThrow();
    expect(() => getGuide("toString")).toThrow();
    expect(() => getGuide("hasOwnProperty")).toThrow();
  });
});

describe("isGuideSlug", () => {
  it("returns true for known slugs", () => {
    for (const slug of guideSlugs) {
      expect(isGuideSlug(slug)).toBe(true);
    }
  });

  it("returns false for unknown slugs", () => {
    expect(isGuideSlug("unknown")).toBe(false);
    expect(isGuideSlug("")).toBe(false);
  });

  it("returns false for prototype-chain keys", () => {
    expect(isGuideSlug("__proto__")).toBe(false);
    expect(isGuideSlug("constructor")).toBe(false);
    expect(isGuideSlug("toString")).toBe(false);
    expect(isGuideSlug("hasOwnProperty")).toBe(false);
  });
});

describe("relatedHelp slugs point to real help articles", () => {
  it("each related help slug exists in the help articles dictionary", async () => {
    const { helpArticles } = await import("@/lib/help/articles");
    for (const slug of guideSlugs) {
      const a = guideArticles[slug];
      for (const helpSlug of a.relatedHelp) {
        expect(
          Object.keys(helpArticles),
          `guide ${slug}: helpSlug ${helpSlug}`,
        ).toContain(helpSlug);
      }
    }
  });
});
