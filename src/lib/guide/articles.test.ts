import { describe, expect, it } from "vitest";
import { getGuide, guideArticles, guideSlugs, isGuideSlug } from "./articles";

describe("guideSlugs", () => {
  it("contains exactly 11 slugs", () => {
    expect(guideSlugs).toHaveLength(11);
  });

  it("contains the expected slugs", () => {
    expect(guideSlugs).toEqual(
      expect.arrayContaining([
        "documento-commerciale-online",
        "scontrino-senza-registratore-di-cassa",
        "differenza-scontrino-ricevuta-fattura",
        "pos-rt-obbligo-2026",
        "scontrino-regime-forfettario",
        "migrare-da-registratore-telematico-a-software",
        "chiusura-giornaliera-corrispettivi",
        "annullare-scontrino-elettronico",
        "lotteria-scontrini-commerciante",
        "scegliere-software-scontrini-elettronici",
        "codici-natura-iva",
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

      it("has well-formed tables when present (headers + rows of equal width)", () => {
        for (const section of a.sections) {
          if (!section.table) continue;
          expect(section.table.headers.length).toBeGreaterThanOrEqual(2);
          expect(section.table.rows.length).toBeGreaterThanOrEqual(2);
          for (const row of section.table.rows) {
            expect(row).toHaveLength(section.table.headers.length);
            for (const cell of row) {
              expect(cell.length).toBeGreaterThan(0);
            }
          }
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

describe("codici-natura-iva", () => {
  const article = guideArticles["codici-natura-iva"];

  it("has a complete N1-N7 table (one row per code, sub-codes included)", () => {
    const tableSection = article.sections.find((s) => s.table !== undefined);
    expect(tableSection).toBeDefined();
    const firstColumn = tableSection!.table!.rows.map((row) => row[0]);
    for (const code of ["N1", "N2", "N2.1", "N2.2", "N4", "N5", "N7"]) {
      expect(firstColumn).toContain(code);
    }
    // N3 e N6 hanno sottocodici: la riga li riporta come intervallo
    expect(firstColumn.some((c) => c.startsWith("N3"))).toBe(true);
    expect(firstColumn.some((c) => c.startsWith("N6"))).toBe(true);
  });

  it("has dedicated sections for the main query forms (cosa significa, N2 vs N2.2, aliquota)", () => {
    const headings = article.sections.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes("cosa significa"))).toBe(true);
    expect(headings.some((h) => h.includes("n2 vs n2.2"))).toBe(true);
    expect(headings.some((h) => h.includes("aliquota"))).toBe(true);
  });
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

describe("relatedTools slugs point to real tools", () => {
  it("each related tool slug exists in the tools dictionary", async () => {
    const { toolSlugs } = await import("@/lib/strumenti/tools");
    for (const slug of guideSlugs) {
      const a = guideArticles[slug];
      for (const toolSlug of a.relatedTools ?? []) {
        expect(toolSlugs, `guide ${slug}: toolSlug ${toolSlug}`).toContain(
          toolSlug,
        );
      }
    }
  });

  it("the forfettario/N2.2 cluster links the dicitura tool", () => {
    expect(guideArticles["codici-natura-iva"].relatedTools).toContain(
      "dicitura-regime-forfettario",
    );
    expect(
      guideArticles["scontrino-regime-forfettario"].relatedTools,
    ).toContain("dicitura-regime-forfettario");
  });
});
