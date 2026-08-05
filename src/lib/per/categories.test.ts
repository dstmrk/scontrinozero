import { describe, expect, it } from "vitest";
import {
  categories,
  categorySlugs,
  getCategory,
  isCategorySlug,
} from "./categories";

describe("categorySlugs", () => {
  it("contains exactly 22 slugs", () => {
    expect(categorySlugs).toHaveLength(22);
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
        "officine-meccanici",
        "eventi-mercatini-hobbisti",
        "palestre-personal-trainer",
        "food-truck",
        "ncc-taxi",
        "tatuatori-piercer",
        "ristoranti-bar-asporto",
        "negozi",
        "pasticcerie-gelaterie-panifici",
        "fioristi",
        "lavanderie",
        "agriturismi-cantine",
        "fotografi",
        "toelettatura",
        "noleggio",
        "stabilimenti-balneari",
      ]),
    );
  });

  it("has unique entries", () => {
    expect(new Set(categorySlugs).size).toBe(categorySlugs.length);
  });
});

describe("categories dictionary", () => {
  for (const slug of categorySlugs) {
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

describe("ristoranti-bar-asporto (framing onesto sui limiti)", () => {
  const c = categories["ristoranti-bar-asporto"];

  it("states the high-throughput limit honestly instead of overpromising", () => {
    const allText = [c.useCase, ...c.faq.map((f) => f.answer)].join(" ");
    // La pagina deve dichiarare che il DCO non è adatto ai banconi ad alto
    // flusso e targettizzare chioschi/stagionali/asporto (decisione utente).
    expect(allText.toLowerCase()).toMatch(/non è (adatt|pensat)/);
  });

  it("targets the low-volume segment in the audience", () => {
    expect(c.audience.toLowerCase()).toMatch(/chiosch|stagional|asporto/);
  });
});

describe("stabilimenti-balneari (riferimenti fiscali verificati)", () => {
  const c = categories["stabilimenti-balneari"];
  const allText = [
    c.useCase,
    ...c.obligations,
    ...c.faq.map((f) => f.answer),
  ].join(" ");

  // I servizi di spiaggia (ombrelloni, sdraio, cabine) NON rientrano nella
  // Tabella A parte III del DPR 633/72: scontano il 22% ordinario, mentre la
  // somministrazione al bar del lido sta al 10% (n. 121 della stessa tabella).
  // È l'unica pagina /per che afferma entrambe: se una review le "corregge"
  // allineandole, il test lo intercetta.
  it("states both VAT rates with their legal basis", () => {
    expect(allText).toContain("22%");
    expect(allText).toContain("10%");
    expect(allText).toContain("Tabella A");
  });

  // Momento di effettuazione degli abbonamenti prepagati: art. 6 c. 3 (incasso)
  // e c. 4 (acconto, limitatamente all'importo pagato).
  it("anchors prepaid season passes to art. 6 DPR 633/72", () => {
    expect(allText).toMatch(/art\. 6/);
    expect(allText.toLowerCase()).toContain("abbonament");
  });

  // Il DM 7 dicembre 2016 impone la descrizione dei servizi resi: è il gancio
  // fra obbligo fiscale e catalogo prodotti.
  it("cites the mandatory service description requirement", () => {
    expect(allText).toContain("DM 7 dicembre 2016");
  });
});

describe("b-and-b (incassi tramite portale di prenotazione)", () => {
  const c = categories["b-and-b"];

  // Il segmento incassa tipicamente via bonifico dal portale, non allo
  // sportello: il bullet sul metodo di pagamento — presente su ambulanti,
  // parrucchieri, eventi e lavanderie — qui mancava del tutto.
  it("names the payment method among the benefits, like the other categories", () => {
    const benefits = c.benefits.join(" ").toLowerCase();
    expect(benefits).toContain("pagamento");
    expect(benefits).toContain("bonifico");
  });

  // Il dettaglio (bonifico = elettronico, assegno = contante, con le FAQ AdE
  // datate) vive nell'articolo help dedicato: la pagina /per ci rimanda.
  it("points at the payment-methods help article", () => {
    expect(c.relatedHelp).toContain("metodi-di-pagamento");
  });
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
