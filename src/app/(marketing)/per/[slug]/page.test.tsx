import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CategoryLandingPage, { generateMetadata } from "./page";
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

/**
 * L'H2 dei benefici prende dall'audience solo il nome della categoria. Alcune
 * audience introducono l'elenco con i due punti ("artigiani: idraulici, …"):
 * tagliare solo alla prima virgola lasciava titoli come "…per artigiani:
 * idraulici".
 */
describe("H2 dei benefici (categoria /per)", () => {
  const PREFISSO = "Come funziona ScontrinoZero per ";

  async function h2Benefici(slug: string) {
    render(await CategoryLandingPage({ params: Promise.resolve({ slug }) }));
    return screen.getByRole("heading", {
      level: 2,
      name: (nome) => nome.startsWith(PREFISSO),
    });
  }

  it("taglia l'audience ai due punti oltre che alla virgola", async () => {
    const h2 = await h2Benefici("artigiani");
    expect(h2.textContent).toBe(`${PREFISSO}artigiani`);
  });

  it("tiene la parte prima dei due punti anche se contiene spazi", async () => {
    const h2 = await h2Benefici("fotografi");
    expect(h2.textContent).toBe(`${PREFISSO}fotografi con clientela privata`);
  });

  it("taglia ancora alla prima virgola quando non ci sono i due punti", async () => {
    const h2 = await h2Benefici("ambulanti");
    expect(h2.textContent).toBe(`${PREFISSO}ambulanti`);
  });

  it("non lascia due punti né virgole nell'H2 di nessuna categoria", async () => {
    for (const slug of categorySlugs) {
      const { unmount } = render(
        await CategoryLandingPage({ params: Promise.resolve({ slug }) }),
      );
      const h2 = screen.getByRole("heading", {
        level: 2,
        name: (nome) => nome.startsWith(PREFISSO),
      });
      expect(h2.textContent, slug).not.toMatch(/[,:]/);
      unmount();
    }
  });
});
