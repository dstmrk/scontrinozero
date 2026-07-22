import { describe, expect, it } from "vitest";
import {
  getGuide,
  guideArticles,
  guideImageFrame,
  guideSlugs,
  isGuideSlug,
} from "./articles";

describe("guideSlugs", () => {
  it("contains exactly 18 slugs", () => {
    expect(guideSlugs).toHaveLength(18);
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
        "stampante-termica-wifi-scontrini",
        "recupero-credenziali-ade-password-scaduta",
        "cassetto-fiscale-dove-trovare-scontrini",
        "obbligo-scontrino-elettronico-2026",
        "registratore-di-cassa-prezzi",
        "sanzioni-mancato-scontrino",
        "registratore-telematico-vs-documento-commerciale-online",
      ]),
    );
  });

  it("no guide slug collides with a help slug (canonical clash /help vs /guide)", async () => {
    const { helpSlugs } = await import("@/lib/help/articles");
    for (const slug of guideSlugs) {
      expect(helpSlugs, `guide slug ${slug} duplicato in /help`).not.toContain(
        slug,
      );
    }
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

      it("has updatedAt in full ISO YYYY-MM-DD format, not before publishedAt", () => {
        expect(a.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Confronto lessicografico: valido per date ISO
        expect(a.updatedAt >= a.publishedAt).toBe(true);
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

      it("has well-formed inline images when present", () => {
        for (const section of a.sections) {
          if (!section.image) continue;
          const { src, alt, width, height, caption } = section.image;
          expect(src).toMatch(/^\/screenshots\/[a-z0-9-]+\.png$/);
          expect(alt.length).toBeGreaterThan(10);
          expect(Number.isInteger(width)).toBe(true);
          expect(Number.isInteger(height)).toBe(true);
          expect(width).toBeGreaterThan(0);
          expect(height).toBeGreaterThan(0);
          if (caption !== undefined) {
            expect(caption.length).toBeGreaterThan(0);
          }
        }
      });
    });
  }
});

describe("guideImageFrame", () => {
  it("uses the wide document frame for the documento commerciale screenshot", () => {
    const frame = guideImageFrame("/screenshots/documento-commerciale.png");
    expect(frame.className).toContain("max-w-[320px]");
    expect(frame.className).toContain("rounded-xl");
    expect(frame.sizes).toContain("320px");
  });

  it("uses the narrow phone-mockup frame for any other screenshot", () => {
    const frame = guideImageFrame("/screenshots/cassa-tastierino.png");
    expect(frame.className).toContain("max-w-[240px]");
    expect(frame.className).not.toContain("rounded-xl");
    expect(frame.sizes).toContain("240px");
  });
});

describe("guide inline screenshots", () => {
  const cases: ReadonlyArray<{
    readonly slug: (typeof guideSlugs)[number];
    readonly src: string;
  }> = [
    {
      slug: "documento-commerciale-online",
      src: "/screenshots/documento-commerciale.png",
    },
    {
      slug: "scontrino-senza-registratore-di-cassa",
      src: "/screenshots/cassa-tastierino.png",
    },
    {
      slug: "annullare-scontrino-elettronico",
      src: "/screenshots/storico-dettaglio.png",
    },
  ];

  for (const { slug, src } of cases) {
    it(`${slug} shows the ${src} screenshot in a section`, () => {
      const section = guideArticles[slug].sections.find(
        (s) => s.image?.src === src,
      );
      expect(section).toBeDefined();
      expect(section!.image!.alt.length).toBeGreaterThan(10);
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

describe("scontrino-senza-registratore-di-cassa (cluster transazionale)", () => {
  const article = guideArticles["scontrino-senza-registratore-di-cassa"];

  it("opens with a direct answer (risposta secca GEO)", () => {
    expect(article.heroIntro.startsWith("Sì")).toBe(true);
  });

  it("has a section answering 'quale app scegliere'", () => {
    const headings = article.sections.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes("quale app"))).toBe(true);
  });

  it("has a cost section with a comparison table (portale, app, RT)", () => {
    const costSection = article.sections.find((s) =>
      s.heading.toLowerCase().includes("quanto costa"),
    );
    expect(costSection).toBeDefined();
    expect(costSection!.table).toBeDefined();
    const firstColumn = costSection!.table!.rows.map((row) =>
      row[0].toLowerCase(),
    );
    expect(firstColumn.some((c) => c.includes("portale"))).toBe(true);
    expect(firstColumn.some((c) => c.includes("app"))).toBe(true);
    expect(firstColumn.some((c) => c.includes("registratore"))).toBe(true);
  });

  it("links the deeper software-selection guide", () => {
    expect(article.relatedGuides).toContain(
      "scegliere-software-scontrini-elettronici",
    );
  });

  it("has FAQ covering the app-choice and cost intents", () => {
    const questions = article.faq.map((f) => f.question.toLowerCase());
    expect(questions.some((q) => q.includes("app"))).toBe(true);
    expect(
      questions.some((q) => q.includes("costa") || q.includes("costo")),
    ).toBe(true);
  });
});

describe("stampante-termica-wifi-scontrini (batch D — gap stampanti)", () => {
  const article = guideArticles["stampante-termica-wifi-scontrini"];

  it("opens with a direct answer (risposta secca GEO): no hardware fiscale", () => {
    expect(article.heroIntro.toLowerCase()).toContain("non serve");
  });

  it("has a connection comparison table covering WiFi, Bluetooth and USB", () => {
    const tableSection = article.sections.find((s) => s.table !== undefined);
    expect(tableSection).toBeDefined();
    const firstColumn = tableSection!.table!.rows.map((row) =>
      row[0].toLowerCase(),
    );
    expect(firstColumn.some((c) => c.includes("wifi"))).toBe(true);
    expect(firstColumn.some((c) => c.includes("bluetooth"))).toBe(true);
    expect(firstColumn.some((c) => c.includes("usb"))).toBe(true);
  });

  it("has dedicated sections for paper width (58/80 mm) and ESC/POS", () => {
    const headings = article.sections.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes("58") && h.includes("80"))).toBe(
      true,
    );
    expect(headings.some((h) => h.includes("esc/pos"))).toBe(true);
  });

  it("never promises native WiFi printing from the app (regola 8)", () => {
    const allText = [
      article.heroIntro,
      ...article.sections.map((s) => s.body),
      ...article.faq.map((f) => f.answer),
    ]
      .join(" ")
      .toLowerCase();
    // Il percorso WiFi passa dal dialogo di stampa del sistema/browser, mai
    // da un collegamento diretto app→stampante WiFi.
    expect(allText).not.toMatch(/app si (collega|connette) (alla|in) wifi/);
  });

  it("has FAQ covering the smartphone and fiscal-printer intents", () => {
    const questions = article.faq.map((f) => f.question.toLowerCase());
    expect(questions.some((q) => q.includes("smartphone"))).toBe(true);
    expect(
      questions.some(
        (q) => q.includes("fiscale") || q.includes("agenzia delle entrate"),
      ),
    ).toBe(true);
  });

  it("links the operational help article on thermal printing", () => {
    expect(article.relatedHelp).toContain("stampare-scontrino-termica");
  });
});

describe("recupero-credenziali-ade-password-scaduta (cluster credenziali AdE)", () => {
  const article = guideArticles["recupero-credenziali-ade-password-scaduta"];

  it("opens with the citable 90-day expiry fact (risposta secca GEO)", () => {
    expect(article.heroIntro).toContain("90 giorni");
  });

  it("cites the dated legal reference for the Fisconline stop (DL 76/2020)", () => {
    const allText = [
      article.heroIntro,
      ...article.sections.map((s) => s.body),
      ...article.faq.map((f) => f.answer),
    ].join(" ");
    expect(allText).toContain("DL 76/2020");
    expect(allText).toContain("1° marzo 2021");
  });

  it("covers SPID and CIE as alternatives", () => {
    const headings = article.sections.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes("spid") && h.includes("cie"))).toBe(
      true,
    );
  });

  it("links the operational credential help cluster", () => {
    expect(article.relatedHelp).toContain("credenziali-fisconline");
    expect(article.relatedHelp).toContain("collegare-ade-con-cie");
  });
});

describe("cassetto-fiscale-dove-trovare-scontrini (cluster cassetto fiscale)", () => {
  const article = guideArticles["cassetto-fiscale-dove-trovare-scontrini"];

  it("opens by correcting the misconception (risposta secca GEO)", () => {
    expect(article.heroIntro).toContain("Fatture e Corrispettivi");
  });

  it("gives the exact portal path in a section", () => {
    const bodies = article.sections.map((s) => s.body).join(" ");
    expect(bodies).toContain("Documento commerciale online");
    expect(bodies).toContain("Ricerca");
  });

  it("answers the private-citizen intent in the FAQ", () => {
    const questions = article.faq.map((f) => f.question.toLowerCase());
    expect(questions.some((q) => q.includes("privato"))).toBe(true);
  });

  it("keeps a distinct slug from the operational help article", () => {
    expect(article.slug).not.toBe("cassetto-fiscale");
    expect(article.relatedHelp).toContain("cassetto-fiscale");
  });
});

describe("obbligo-scontrino-elettronico-2026 (head term informativo)", () => {
  const article = guideArticles["obbligo-scontrino-elettronico-2026"];

  it("opens with the direct answer and the dated legal basis", () => {
    expect(article.heroIntro).toContain("obbligatorio");
    expect(article.heroIntro).toContain("D.Lgs. 127/2015");
  });

  it("cites the citable sanction facts post-riforma (70%, 300 €, D.Lgs. 87/2024)", () => {
    const allText = [
      ...article.sections.map((s) => s.body),
      ...article.faq.map((f) => f.answer),
    ].join(" ");
    expect(allText).toContain("70%");
    expect(allText).toContain("300 €");
    expect(allText).toContain("D.Lgs. 471/1997");
    expect(allText).toContain("D.Lgs. 87/2024");
  });

  it("covers the 2026 POS linkage with its legal reference (L. 207/2024)", () => {
    const bodies = article.sections.map((s) => s.body).join(" ");
    expect(bodies).toContain("L. 207/2024");
  });

  it("links the POS-RT cluster without duplicating its slug", () => {
    expect(article.relatedGuides).toContain("pos-rt-obbligo-2026");
    expect(article.slug).not.toBe("pos-rt-obbligo-2026");
  });
});

describe("registratore-di-cassa-prezzi (commerciale-investigazionale)", () => {
  const article = guideArticles["registratore-di-cassa-prezzi"];

  it("opens with citable price facts (risposta secca GEO)", () => {
    expect(article.heroIntro).toContain("400-800 €");
  });

  it("has a 3-year cost comparison table including the AdE portal", () => {
    const tableSection = article.sections.find((s) => s.table !== undefined);
    expect(tableSection).toBeDefined();
    const firstColumn = tableSection!.table!.rows.map((r) =>
      r[0].toLowerCase(),
    );
    expect(firstColumn.some((c) => c.includes("registratore"))).toBe(true);
    expect(firstColumn.some((c) => c.includes("portale"))).toBe(true);
  });

  it("does not promise tax credits that are currently exhausted", () => {
    const bonusFaq = article.faq.find((f) =>
      f.question.toLowerCase().includes("bonus"),
    );
    expect(bonusFaq).toBeDefined();
    expect(bonusFaq!.answer.toLowerCase()).toContain("esauriti");
  });

  it("links the savings calculator tool", () => {
    expect(article.relatedTools).toContain("calcolatore-risparmio-rt");
  });
});

describe("sanzioni-mancato-scontrino (post riforma D.Lgs. 87/2024)", () => {
  const article = guideArticles["sanzioni-mancato-scontrino"];

  it("opens with the current sanction figures (70%, 300 €)", () => {
    expect(article.heroIntro).toContain("70%");
    expect(article.heroIntro).toContain("300 €");
    expect(article.heroIntro).toContain("D.Lgs. 87/2024");
  });

  it("dates the reform and mentions the previous regime", () => {
    const bodies = article.sections.map((s) => s.body).join(" ");
    expect(bodies).toContain("1° settembre 2024");
    expect(bodies).toContain("90%");
  });

  it("covers the licence-suspension recidiva with its legal basis", () => {
    const bodies = article.sections.map((s) => s.body).join(" ");
    expect(bodies).toContain("art. 12");
    expect(bodies).toMatch(/4 violazioni/);
  });

  it("answers the customer-fine myth in the FAQ", () => {
    const clientFaq = article.faq.find((f) =>
      f.question.toLowerCase().includes("cliente"),
    );
    expect(clientFaq).toBeDefined();
    expect(clientFaq!.answer.startsWith("No")).toBe(true);
  });
});

describe("registratore-telematico-vs-documento-commerciale-online", () => {
  const article =
    guideArticles["registratore-telematico-vs-documento-commerciale-online"];

  it("opens by stating fiscal equivalence (risposta secca GEO)", () => {
    expect(article.heroIntro).toContain("fiscalmente equivalenti");
  });

  it("has a point-by-point comparison table (costi, offline, chiusura)", () => {
    const tableSection = article.sections.find((s) => s.table !== undefined);
    expect(tableSection).toBeDefined();
    const aspects = tableSection!.table!.rows.map((r) => r[0].toLowerCase());
    expect(aspects.some((a) => a.includes("costo"))).toBe(true);
    expect(aspects.some((a) => a.includes("connettiv"))).toBe(true);
    expect(aspects.some((a) => a.includes("chiusura"))).toBe(true);
  });

  it("recommends the RT honestly for high-throughput counters", () => {
    const rtSection = article.sections.find((s) =>
      s.heading.toLowerCase().includes("registratore telematico"),
    );
    expect(rtSection).toBeDefined();
    expect(rtSection!.body.toLowerCase()).toMatch(/flusso|fila|coda/);
  });

  it("links the migration guide and the pricing guide", () => {
    expect(article.relatedGuides).toContain(
      "migrare-da-registratore-telematico-a-software",
    );
    expect(article.relatedGuides).toContain("registratore-di-cassa-prezzi");
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
