import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia sul listino scritto in un posto solo (issue #1106).
 *
 * I sei prezzi di listino vivono in `src/lib/plan-prices.ts`; ogni pagina,
 * FAQ, metadato o JSON-LD li legge da lì. Un prezzo riscritto a mano diverge
 * al primo cambio di listino senza che nulla fallisca: è il caso delle date
 * di `/help` (skill `marketing-content`, "Doppia scrittura vietata").
 *
 * Il gate cerca i sei importi, con la virgola o col punto, in tutto `src`
 * tranne i test. Gli altri importi (sanzioni, bollo, costi dell'RT) non li
 * tocca: il pattern riconosce solo quei sei.
 */
const SRC_DIR = path.resolve(import.meta.dirname, "..");

const SOURCE_OF_TRUTH = path.join("lib", "plan-prices.ts");

/** 4,99 · 8,99 · 17,99 · 29,99 · 49,99 · 99,99, anche col punto. */
const LISTED_PRICE = /\b(?:4|8|17|29|49|99)[.,]99\b/g;

/**
 * Importi uguali a un nostro prezzo che non sono il nostro listino, col
 * motivo. Verificate: un'esenzione che non trova più il suo testo fa fallire
 * la suite.
 */
const EXEMPT: ReadonlyArray<{ file: string; text: string; reason: string }> = [
  {
    file: path.join("lib", "confronto", "comparisons.ts"),
    text: 'pricing: "4,99 €/mese + IVA"',
    reason: "listino di CassaDigitale, un concorrente",
  },
];

function findListedPrices(source: string): string[] {
  return source.match(LISTED_PRICE) ?? [];
}

function collectSourceFiles(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, found);
    } else if (
      /\.(tsx?|mjs)$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    ) {
      found.push(full);
    }
  }
  return found;
}

function read(relative: string): string {
  return readFileSync(path.join(SRC_DIR, relative), "utf8");
}

function withoutExemptions(relative: string, source: string): string {
  return EXEMPT.filter((e) => e.file === relative).reduce(
    (text, e) => text.replaceAll(e.text, ""),
    source,
  );
}

const sourceFiles = collectSourceFiles(SRC_DIR, [])
  .map((full) => path.relative(SRC_DIR, full))
  .filter((rel) => rel !== SOURCE_OF_TRUTH);

describe("riconoscimento dei prezzi di listino", () => {
  it("trova un prezzo di listino in ogni formato in uso", () => {
    expect(findListedPrices("Pro (€49,99/anno)")).toEqual(["49,99"]);
    expect(findListedPrices("49,99 €/anno")).toEqual(["49,99"]);
    expect(findListedPrices('{ price: "4.99" }')).toEqual(["4.99"]);
    expect(findListedPrices("const X = 29.99;")).toEqual(["29.99"]);
  });

  it("lascia stare gli importi che non sono il listino", () => {
    expect(findListedPrices("bollo da 2,00 € oltre 77,47 €")).toEqual([]);
    expect(findListedPrices("minimo 300 €, 1.000-4.000 €")).toEqual([]);
    expect(findListedPrices("199,99 € e 4,990 kg")).toEqual([]);
  });
});

describe("listino in un posto solo (issue #1106)", () => {
  it("scansiona le superfici che mostrano i prezzi (il gate non gira a vuoto)", () => {
    expect(sourceFiles).toEqual(
      expect.arrayContaining([
        path.join("components", "marketing", "pricing-section.tsx"),
        path.join("components", "billing", "plan-selection.tsx"),
        path.join("app", "llms.txt", "route.ts"),
      ]),
    );
  });

  it("nessun file fuori da plan-prices.ts scrive a mano un prezzo di listino", () => {
    const handWritten = sourceFiles.flatMap((rel) =>
      findListedPrices(withoutExemptions(rel, read(rel))).map(
        (price) => `${rel}: ${price}`,
      ),
    );
    expect(handWritten).toEqual([]);
  });

  it("ogni esenzione trova ancora il suo testo", () => {
    const stale = EXEMPT.filter((e) => !read(e.file).includes(e.text)).map(
      (e) => `${e.file}: ${e.text}`,
    );
    expect(stale).toEqual([]);
  });
});
