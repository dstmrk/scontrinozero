import { describe, it, expect } from "vitest";
import { guideArticles } from "@/lib/guide/articles";
import { categories } from "@/lib/per/categories";
import { tools } from "@/lib/strumenti/tools";
import { helpArticles } from "@/lib/help/articles";
import { confrontoContent } from "@/lib/confronto/comparisons";

/**
 * Guard anti-regressione sulla lunghezza dei metadati SEO delle pagine
 * marketing: titoli e description troppo lunghi vengono troncati nella SERP.
 *
 * Non sono i limiti di display "ottimali" di Google (~60 char titolo, ~155
 * description) — il corpus attuale, già passato da review umana, front-carica
 * le keyword e accetta titoli più lunghi. Sono soffitti che impediscono di
 * peggiorare: nuovi contenuti (o modifiche) che sforano vengono bloccati in CI.
 *
 * Titolo: il root layout applica il template "%s | ScontrinoZero", quindi la
 * lunghezza che conta è quella *effettiva* renderizzata (titolo + suffisso).
 * Alcuni registry (es. /per) bakano già il suffisso nel valore: lo
 * normalizziamo togliendolo e riaggiungendone uno solo, così tutti i registry
 * si misurano sulla stessa base a prescindere dalla convenzione locale.
 */
const BRAND_SUFFIX = " | ScontrinoZero";
const TITLE_MAX_EFFECTIVE = 81; // ≈ 65 char di titolo + suffisso brand
const DESCRIPTION_MAX = 200;

function effectiveTitleLength(title: string): number {
  const bare = title.replace(/\s*\|\s*ScontrinoZero\s*$/, "");
  return bare.length + BRAND_SUFFIX.length;
}

interface MetaRow {
  readonly registry: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

const rows: readonly MetaRow[] = [
  ...Object.values(guideArticles).map((a) => ({
    registry: "guide",
    slug: a.slug,
    title: a.metaTitle,
    description: a.metaDescription,
  })),
  ...Object.values(categories).map((c) => ({
    registry: "per",
    slug: c.slug,
    title: c.metaTitle,
    description: c.metaDescription,
  })),
  ...Object.values(tools).map((t) => ({
    registry: "strumenti",
    slug: t.slug,
    title: t.metaTitle,
    description: t.metaDescription,
  })),
  ...Object.values(helpArticles).map((h) => ({
    registry: "help",
    slug: h.slug,
    title: h.metaTitle,
    description: h.description,
  })),
  {
    registry: "confronto",
    slug: "confronto",
    title: confrontoContent.metaTitle,
    description: confrontoContent.metaDescription,
  },
];

describe("marketing metadata length", () => {
  it("covers every editorial registry", () => {
    // Sanity: se un registry sparisce o si svuota il guard non protegge nulla.
    expect(rows.length).toBeGreaterThanOrEqual(40);
    for (const registry of ["guide", "per", "strumenti", "help", "confronto"]) {
      expect(rows.some((r) => r.registry === registry)).toBe(true);
    }
  });

  it(`keeps effective titles within ${TITLE_MAX_EFFECTIVE} chars (brand suffix included)`, () => {
    const offenders = rows
      .filter((r) => effectiveTitleLength(r.title) > TITLE_MAX_EFFECTIVE)
      .map((r) => `${r.registry}/${r.slug}=${effectiveTitleLength(r.title)}`);
    expect(offenders).toEqual([]);
  });

  it(`keeps meta descriptions within ${DESCRIPTION_MAX} chars`, () => {
    const offenders = rows
      .filter((r) => r.description.length > DESCRIPTION_MAX)
      .map((r) => `${r.registry}/${r.slug}=${r.description.length}`);
    expect(offenders).toEqual([]);
  });

  it("has a non-empty title and description for every entry", () => {
    const empty = rows
      .filter((r) => r.title.trim() === "" || r.description.trim() === "")
      .map((r) => `${r.registry}/${r.slug}`);
    expect(empty).toEqual([]);
  });
});
