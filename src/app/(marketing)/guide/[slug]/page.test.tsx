import { describe, it, expect } from "vitest";
import { generateMetadata } from "./page";
import { guideArticles, guideSlugs } from "@/lib/guide/articles";

/**
 * Il `<title>` di una guida deve arrivare in SERP intero. Il template root
 * (`"%s | ScontrinoZero"` in `src/app/layout.tsx`) aggiungerebbe 16 caratteri
 * di suffisso brand a un metaTitle già lungo fino a 60: il risultato viene
 * troncato da Google intorno ai 60 caratteri, quindi il brand non si vede mai
 * e la coda della keyword sparisce. Le guide dichiarano perciò un title
 * `absolute`, che bypassa il template — il brand resta comunque visibile in
 * SERP tramite il site name (`webSiteJsonLd`) e il breadcrumb del dominio.
 */
describe("generateMetadata (guida)", () => {
  it("dichiara il metaTitle come title assoluto, senza suffisso brand", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "sanzioni-mancato-scontrino" }),
    });
    expect(meta.title).toEqual({
      absolute: guideArticles["sanzioni-mancato-scontrino"].metaTitle,
    });
  });

  it("usa la metaDescription del registry", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "codici-natura-iva" }),
    });
    expect(meta.description).toBe(
      guideArticles["codici-natura-iva"].metaDescription,
    );
  });

  it("imposta un canonical self-referential sotto /guide", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "codici-natura-iva" }),
    });
    expect(meta.alternates?.canonical).toBe(
      "https://scontrinozero.it/guide/codici-natura-iva",
    );
  });

  it("rispecchia title/description/url in Open Graph", async () => {
    const article = guideArticles["registratore-di-cassa-prezzi"];
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "registratore-di-cassa-prezzi" }),
    });
    expect(meta.openGraph?.title).toBe(article.metaTitle);
    expect(meta.openGraph?.description).toBe(article.metaDescription);
    expect(meta.openGraph).toMatchObject({
      url: "https://scontrinozero.it/guide/registratore-di-cassa-prezzi",
      type: "article",
    });
  });

  it("nessuno slug produce un title che riporta il suffisso brand", async () => {
    for (const slug of guideSlugs) {
      const meta = await generateMetadata({
        params: Promise.resolve({ slug }),
      });
      expect(meta.title).toEqual({
        absolute: guideArticles[slug].metaTitle,
      });
    }
  });

  // Il fallback era una stringa piana, quindi il template root ci appendeva un
  // secondo suffisso: "Guida non trovata | ScontrinoZero | ScontrinoZero".
  it("degrada su uno slug sconosciuto senza duplicare il suffisso brand", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "non-esiste" }),
    });
    expect(meta.title).toEqual({
      absolute: "Guida non trovata | ScontrinoZero",
    });
  });
});
