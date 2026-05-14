import { describe, expect, it } from "vitest";
import { getTool, isToolSlug, tools, toolSlugs } from "./tools";

describe("toolSlugs", () => {
  it("contains exactly 3 slugs", () => {
    expect(toolSlugs).toHaveLength(3);
  });

  it("contains the expected slugs", () => {
    expect(toolSlugs).toEqual(
      expect.arrayContaining([
        "scorporo-iva",
        "verifica-codice-lotteria",
        "calcolatore-risparmio-rt",
      ]),
    );
  });

  it("has unique entries", () => {
    expect(new Set(toolSlugs).size).toBe(toolSlugs.length);
  });
});

describe("tools dictionary", () => {
  for (const slug of [
    "scorporo-iva",
    "verifica-codice-lotteria",
    "calcolatore-risparmio-rt",
  ] as const) {
    describe(slug, () => {
      const t = tools[slug];

      it("has matching slug", () => {
        expect(t.slug).toBe(slug);
      });

      it("has non-empty title (under 70 chars)", () => {
        expect(t.title.length).toBeGreaterThan(5);
        expect(t.title.length).toBeLessThanOrEqual(70);
      });

      it("has metaTitle 30–70 chars", () => {
        expect(t.metaTitle.length).toBeGreaterThanOrEqual(30);
        expect(t.metaTitle.length).toBeLessThanOrEqual(70);
      });

      it("has metaDescription 80–170 chars", () => {
        expect(t.metaDescription.length).toBeGreaterThanOrEqual(80);
        expect(t.metaDescription.length).toBeLessThanOrEqual(170);
      });

      it("has heroIntro of at least 80 chars", () => {
        expect(t.heroIntro.length).toBeGreaterThanOrEqual(80);
      });

      it("has at least 2 FAQ entries", () => {
        expect(t.faq.length).toBeGreaterThanOrEqual(2);
        for (const item of t.faq) {
          expect(item.question.length).toBeGreaterThan(10);
          expect(item.answer.length).toBeGreaterThan(30);
        }
      });

      it("has 2–4 related help slugs", () => {
        expect(t.relatedHelp.length).toBeGreaterThanOrEqual(2);
        expect(t.relatedHelp.length).toBeLessThanOrEqual(4);
      });
    });
  }
});

describe("getTool", () => {
  it("returns the tool for a known slug", () => {
    expect(getTool("scorporo-iva").slug).toBe("scorporo-iva");
  });

  it("throws for an unknown slug", () => {
    expect(() => getTool("unknown")).toThrow();
  });

  it("throws for empty slug", () => {
    expect(() => getTool("")).toThrow();
  });

  it("throws for prototype-chain keys", () => {
    expect(() => getTool("__proto__")).toThrow();
    expect(() => getTool("constructor")).toThrow();
    expect(() => getTool("toString")).toThrow();
    expect(() => getTool("hasOwnProperty")).toThrow();
  });
});

describe("isToolSlug", () => {
  it("returns true for known slugs", () => {
    for (const slug of toolSlugs) {
      expect(isToolSlug(slug)).toBe(true);
    }
  });

  it("returns false for unknown slugs", () => {
    expect(isToolSlug("unknown")).toBe(false);
    expect(isToolSlug("")).toBe(false);
  });

  it("returns false for prototype-chain keys", () => {
    expect(isToolSlug("__proto__")).toBe(false);
    expect(isToolSlug("constructor")).toBe(false);
    expect(isToolSlug("toString")).toBe(false);
    expect(isToolSlug("hasOwnProperty")).toBe(false);
  });
});

describe("relatedHelp slugs point to real help articles", () => {
  it("each related help slug exists in the help articles dictionary", async () => {
    const { helpArticles } = await import("@/lib/help/articles");
    for (const slug of toolSlugs) {
      const t = tools[slug];
      for (const helpSlug of t.relatedHelp) {
        expect(
          Object.keys(helpArticles),
          `tool ${slug}: helpSlug ${helpSlug}`,
        ).toContain(helpSlug);
      }
    }
  });
});
