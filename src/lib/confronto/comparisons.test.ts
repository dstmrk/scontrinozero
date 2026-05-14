import { describe, expect, it } from "vitest";
import {
  comparisons,
  comparisonSlugs,
  getComparison,
  isComparisonSlug,
} from "./comparisons";

describe("comparisonSlugs", () => {
  it("contains exactly 3 slugs", () => {
    expect(comparisonSlugs).toHaveLength(3);
  });

  it("contains the expected slugs", () => {
    expect(comparisonSlugs).toEqual(
      expect.arrayContaining([
        "registratore-telematico",
        "scontrinare",
        "fatture-in-cloud",
      ]),
    );
  });

  it("has unique entries", () => {
    expect(new Set(comparisonSlugs).size).toBe(comparisonSlugs.length);
  });
});

describe("comparisons dictionary", () => {
  for (const slug of [
    "registratore-telematico",
    "scontrinare",
    "fatture-in-cloud",
  ] as const) {
    describe(slug, () => {
      const c = comparisons[slug];

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

      it("has a non-empty competitorName", () => {
        expect(c.competitorName.length).toBeGreaterThan(2);
      });

      it("has a heroIntro of at least 80 chars", () => {
        expect(c.heroIntro.length).toBeGreaterThanOrEqual(80);
      });

      it("has whenToChoose.competitor with at least 2 reasons (honesty)", () => {
        expect(c.whenToChoose.competitor.length).toBeGreaterThanOrEqual(2);
        for (const item of c.whenToChoose.competitor) {
          expect(item.length).toBeGreaterThan(15);
        }
      });

      it("has whenToChoose.us with at least 3 reasons", () => {
        expect(c.whenToChoose.us.length).toBeGreaterThanOrEqual(3);
        for (const item of c.whenToChoose.us) {
          expect(item.length).toBeGreaterThan(15);
        }
      });

      it("has at least 5 comparison rows", () => {
        expect(c.rows.length).toBeGreaterThanOrEqual(5);
      });

      it("every row has a non-empty label", () => {
        for (const row of c.rows) {
          expect(row.label.length).toBeGreaterThan(2);
        }
      });

      it("every row has competitor/ours fields of expected types", () => {
        for (const row of c.rows) {
          expect(["string", "boolean"]).toContain(typeof row.competitor);
          expect(["string", "boolean"]).toContain(typeof row.ours);
        }
      });

      it("has lastUpdated in YYYY-MM format", () => {
        expect(c.lastUpdated).toMatch(/^\d{4}-\d{2}$/);
      });

      it("has at least 3 FAQ entries with question + answer", () => {
        expect(c.faq.length).toBeGreaterThanOrEqual(3);
        for (const item of c.faq) {
          expect(item.question.length).toBeGreaterThan(10);
          expect(item.answer.length).toBeGreaterThan(30);
        }
      });

      it("has 3–4 related help article slugs", () => {
        expect(c.relatedHelp.length).toBeGreaterThanOrEqual(3);
        expect(c.relatedHelp.length).toBeLessThanOrEqual(4);
        for (const helpSlug of c.relatedHelp) {
          expect(typeof helpSlug).toBe("string");
          expect(helpSlug.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("getComparison", () => {
  it("returns the comparison for a known slug", () => {
    const c = getComparison("registratore-telematico");
    expect(c.slug).toBe("registratore-telematico");
  });

  it("throws for an unknown slug", () => {
    expect(() => getComparison("unknown-slug")).toThrow();
  });

  it("throws for an empty slug", () => {
    expect(() => getComparison("")).toThrow();
  });

  it("throws for prototype-chain keys (e.g. __proto__, constructor)", () => {
    expect(() => getComparison("__proto__")).toThrow();
    expect(() => getComparison("constructor")).toThrow();
    expect(() => getComparison("toString")).toThrow();
    expect(() => getComparison("hasOwnProperty")).toThrow();
  });
});

describe("isComparisonSlug", () => {
  it("returns true for known slugs", () => {
    for (const slug of comparisonSlugs) {
      expect(isComparisonSlug(slug)).toBe(true);
    }
  });

  it("returns false for unknown slugs", () => {
    expect(isComparisonSlug("unknown")).toBe(false);
    expect(isComparisonSlug("")).toBe(false);
  });

  it("returns false for prototype-chain keys", () => {
    expect(isComparisonSlug("__proto__")).toBe(false);
    expect(isComparisonSlug("constructor")).toBe(false);
    expect(isComparisonSlug("toString")).toBe(false);
    expect(isComparisonSlug("hasOwnProperty")).toBe(false);
  });
});

describe("relatedHelp slugs point to real help articles", () => {
  it("each related help slug exists in the help articles dictionary", async () => {
    const { helpArticles } = await import("@/lib/help/articles");
    for (const slug of comparisonSlugs) {
      const c = comparisons[slug];
      for (const helpSlug of c.relatedHelp) {
        expect(
          Object.keys(helpArticles),
          `comparison ${slug}: helpSlug ${helpSlug}`,
        ).toContain(helpSlug);
      }
    }
  });
});
