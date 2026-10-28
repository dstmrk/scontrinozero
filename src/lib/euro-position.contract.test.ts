import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia sulla posizione del simbolo (issue #1119): sulle superfici
 * marketing ogni importo è `cifra €`, come lo scrive
 * `Intl.NumberFormat("it-IT")` (`29,99 €`). `€470`, `€ 85.000`, `€{x}` e
 * `` `€${x}` `` sono l'ordine inglese e convivono nella stessa tabella con
 * i prezzi di listino già nel formato giusto.
 *
 * Il pattern boccia `€` seguito da una cifra, da `{` o da `${`, con uno
 * spazio facoltativo in mezzo. Una frase senza importi ("in €") passa.
 * Dashboard, email e PDF usano `formatCurrency` e restano fuori.
 */
const SRC_DIR = path.resolve(import.meta.dirname, "..");

type Exemption = Readonly<{ file: string; text: string; reason: string }>;

/** Importi con `€` davanti che non vanno riscritti. */
const EURO_EXEMPT: readonly Exemption[] = [];

const EURO_BEFORE_AMOUNT = /€ ?(?:\d|\{|\$\{)/g;

const SURFACES = [
  path.join("app", "(marketing)"),
  path.join("app", "llms.txt"),
  path.join("app", "llms-full.txt"),
  path.join("components", "marketing"),
  path.join("components", "help"),
  path.join("lib", "guide"),
  path.join("lib", "help"),
  path.join("lib", "per"),
  path.join("lib", "confronto"),
  path.join("lib", "strumenti"),
];

function findEuroBefore(source: string): string[] {
  return [...source.matchAll(EURO_BEFORE_AMOUNT)].map((m) =>
    source
      .slice(Math.max(0, m.index - 20), m.index + 25)
      .replaceAll(/\s+/g, " ")
      .trim(),
  );
}

function collect(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, found);
    } else if (
      /\.(tsx?|mjs|mdx?)$/.test(entry.name) &&
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

const files = SURFACES.flatMap((s) => collect(path.join(SRC_DIR, s), [])).map(
  (full) => path.relative(SRC_DIR, full),
);

describe("riconoscimento del simbolo davanti all'importo", () => {
  it("boccia € prima di una cifra, di { e di ${", () => {
    expect(findEuroBefore("oltre €470")).toHaveLength(1);
    expect(findEuroBefore("<strong>€ 85.000 annui</strong>")).toHaveLength(1);
    expect(findEuroBefore("(€{RT_COSTS.purchase.min}-")).toHaveLength(1);
    expect(findEuroBefore("`€${min}–${max}`")).toHaveLength(1);
  });

  it("lascia passare cifra € e le frasi senza importi", () => {
    expect(findEuroBefore("oltre 470 €")).toEqual([]);
    expect(findEuroBefore("85.000 € annui")).toEqual([]);
    expect(findEuroBefore("importi in € senza decimali")).toEqual([]);
    expect(findEuroBefore("550-1.100 €")).toEqual([]);
  });
});

describe("simbolo dell'euro dopo la cifra (issue #1119)", () => {
  it("scansiona le superfici marketing (il gate non gira a vuoto)", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        path.join("app", "(marketing)", "page.tsx"),
        path.join("lib", "guide", "articles.ts"),
        path.join("lib", "per", "categories.ts"),
        path.join("app", "llms.txt", "route.ts"),
      ]),
    );
  });

  it("nessun importo ha il simbolo davanti", () => {
    const hits = files.flatMap((rel) => {
      const source = EURO_EXEMPT.filter((e) => e.file === rel).reduce(
        (text, e) => text.replaceAll(e.text, ""),
        read(rel),
      );
      return findEuroBefore(source).map((hit) => `${rel}: ${hit}`);
    });
    expect(hits).toEqual([]);
  });

  it("ogni esenzione trova ancora il suo testo", () => {
    expect(
      EURO_EXEMPT.filter((e) => !read(e.file).includes(e.text)).map(
        (e) => `${e.file}: ${e.text}`,
      ),
    ).toEqual([]);
  });
});
