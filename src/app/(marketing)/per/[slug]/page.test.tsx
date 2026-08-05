import { describe, it, expect } from "vitest";
import { generateMetadata } from "./page";
import { categories, categorySlugs } from "@/lib/per/categories";

/**
 * Stessa ragione delle guide e degli articoli help: il template root
 * ("%s | ScontrinoZero") aggiungerebbe 16 caratteri a un metaTitle già vicino
 * al limite di troncamento SERP, tagliando la coda della keyword senza
 * nemmeno mostrare il brand — visibile comunque via site name e breadcrumb.
 */
describe("generateMetadata (categoria /per)", () => {
  it("dichiara il metaTitle come title assoluto su ogni categoria", async () => {
    for (const slug of categorySlugs) {
      const meta = await generateMetadata({
        params: Promise.resolve({ slug }),
      });
      expect(meta.title).toEqual({ absolute: categories[slug].metaTitle });
    }
  });

  it("imposta un canonical self-referential sotto /per", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "regime-forfettario" }),
    });
    expect(meta.alternates?.canonical).toBe(
      "https://scontrinozero.it/per/regime-forfettario",
    );
  });

  it("degrada su uno slug sconosciuto senza duplicare il suffisso brand", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "non-esiste" }),
    });
    expect(meta.title).toEqual({
      absolute: "Categoria non trovata | ScontrinoZero",
    });
  });
});
