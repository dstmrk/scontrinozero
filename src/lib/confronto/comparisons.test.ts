import { describe, expect, it } from "vitest";
import { confrontoContent } from "./comparisons";

describe("confrontoContent — metadata", () => {
  it("has a non-empty title (under 70 chars)", () => {
    expect(confrontoContent.title.length).toBeGreaterThan(5);
    expect(confrontoContent.title.length).toBeLessThanOrEqual(70);
  });

  it("has metaTitle 30–70 chars", () => {
    expect(confrontoContent.metaTitle.length).toBeGreaterThanOrEqual(30);
    expect(confrontoContent.metaTitle.length).toBeLessThanOrEqual(70);
  });

  it("has metaDescription 80–250 chars", () => {
    expect(confrontoContent.metaDescription.length).toBeGreaterThanOrEqual(80);
    expect(confrontoContent.metaDescription.length).toBeLessThanOrEqual(250);
  });

  it("has a heroIntro of at least 200 chars", () => {
    expect(confrontoContent.heroIntro.length).toBeGreaterThanOrEqual(200);
  });

  it("has lastUpdated in full ISO YYYY-MM-DD format", () => {
    expect(confrontoContent.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("confrontoContent — categories", () => {
  it("contains exactly 3 categories", () => {
    expect(confrontoContent.categories).toHaveLength(3);
  });

  it("covers registratore telematico, fatturazione B2B and SaaS scontrino", () => {
    const ids = confrontoContent.categories.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "registratore-telematico",
        "fatturazione-b2b",
        "saas-scontrino",
      ]),
    );
  });

  it("every category has non-empty title, intro and both whenFits/whenWeFit", () => {
    for (const cat of confrontoContent.categories) {
      expect(cat.title.length).toBeGreaterThan(5);
      expect(cat.intro.length).toBeGreaterThan(50);
      expect(cat.whenItFits.length).toBeGreaterThanOrEqual(2);
      expect(cat.whenWeFit.length).toBeGreaterThanOrEqual(2);
      for (const item of cat.whenItFits) {
        expect(item.length).toBeGreaterThan(15);
      }
      for (const item of cat.whenWeFit) {
        expect(item.length).toBeGreaterThan(15);
      }
    }
  });

  it("category ids are unique", () => {
    const ids = confrontoContent.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("confrontoContent — saasCompetitors", () => {
  it("lists exactly the 5 verified competitors", () => {
    expect(confrontoContent.saasCompetitors).toHaveLength(5);
    const names = confrontoContent.saasCompetitors.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Scontrinare",
        "Scontrina",
        "ScontrinoSenzaCassa (Billy)",
        "CassaDigitale",
        "WinScontrino",
      ]),
    );
  });

  it("every competitor has a valid HTTPS url and non-empty fields", () => {
    for (const s of confrontoContent.saasCompetitors) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.displayUrl.length).toBeGreaterThan(3);
      expect(s.pricing.length).toBeGreaterThan(2);
      expect(s.trial.length).toBeGreaterThan(2);
      expect(s.notes.length).toBeGreaterThan(20);
    }
  });

  it("competitor URLs are unique", () => {
    const urls = confrontoContent.saasCompetitors.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("saasIntro is non-empty and reminds the user to verify on the official site", () => {
    expect(confrontoContent.saasIntro.length).toBeGreaterThan(50);
    expect(confrontoContent.saasIntro.toLowerCase()).toContain("verifica");
  });
});

describe("confrontoContent — differentiators and positioning", () => {
  it("lists at least 3 differentiators", () => {
    expect(confrontoContent.differentiators.length).toBeGreaterThanOrEqual(3);
    for (const item of confrontoContent.differentiators) {
      expect(item.length).toBeGreaterThan(20);
    }
  });

  it("has both bestFor and notBestFor with at least 2 items each", () => {
    expect(
      confrontoContent.ourPositioning.bestFor.length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      confrontoContent.ourPositioning.notBestFor.length,
    ).toBeGreaterThanOrEqual(2);
    for (const item of confrontoContent.ourPositioning.bestFor) {
      expect(item.length).toBeGreaterThan(20);
    }
    for (const item of confrontoContent.ourPositioning.notBestFor) {
      expect(item.length).toBeGreaterThan(20);
    }
  });
});

describe("confrontoContent — FAQ", () => {
  it("has at least 3 FAQ entries", () => {
    expect(confrontoContent.faq.length).toBeGreaterThanOrEqual(3);
  });

  it("every FAQ has a non-empty question and a substantive answer", () => {
    for (const item of confrontoContent.faq) {
      expect(item.question.length).toBeGreaterThan(10);
      expect(item.answer.length).toBeGreaterThan(40);
    }
  });
});

describe("confrontoContent — relatedHelp", () => {
  it("references at least 3 help slugs and they are unique", () => {
    expect(confrontoContent.relatedHelp.length).toBeGreaterThanOrEqual(3);
    expect(new Set(confrontoContent.relatedHelp).size).toBe(
      confrontoContent.relatedHelp.length,
    );
  });

  it("every relatedHelp slug exists in the help articles dictionary", async () => {
    const { helpArticles } = await import("@/lib/help/articles");
    for (const slug of confrontoContent.relatedHelp) {
      expect(Object.keys(helpArticles), `helpSlug ${slug}`).toContain(slug);
    }
  });
});
