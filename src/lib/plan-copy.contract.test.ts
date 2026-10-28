import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRIAL_DAYS } from "./plans-shared";

/**
 * Guardia sui fatti dei piani scritti in un posto solo (issue #1106): il
 * listino in `src/lib/plan-prices.ts` e la durata della prova in
 * `TRIAL_DAYS` (`src/lib/plans-shared.ts`). Ogni pagina, FAQ, metadato o
 * JSON-LD li legge da lì. Un valore riscritto a mano diverge al primo cambio
 * senza che nulla fallisca: è il caso delle date di `/help` (skill
 * `marketing-content`, "Doppia scrittura vietata").
 *
 * I due controlli guardano tutto `src` tranne i test. Il listino: i sei
 * importi, con la virgola o col punto; gli altri importi (sanzioni, bollo,
 * costi dell'RT) non corrispondono al pattern. La prova: "30 giorni" vicino a
 * prova, trial o gratis, fuori dalle righe di commento; gli altri 30 giorni
 * (finestra delle analytics, tempi di cancellazione) non hanno quel contesto.
 */
const SRC_DIR = path.resolve(import.meta.dirname, "..");

type Exemption = Readonly<{ file: string; text: string; reason: string }>;

/** 4,99 · 8,99 · 17,99 · 29,99 · 49,99 · 99,99, anche col punto. */
const LISTED_PRICE = /\b(?:4|8|17|29|49|99)[.,]99\b/g;

/** Importi uguali a un nostro prezzo che non sono il nostro listino. */
const PRICE_EXEMPT: readonly Exemption[] = [
  {
    file: path.join("lib", "confronto", "comparisons.ts"),
    text: 'pricing: "4,99 €/mese + IVA"',
    reason: "listino di CassaDigitale, un concorrente",
  },
];

const TERMS_V01 = path.join("app", "(marketing)", "termini", "v01", "page.tsx");
const TERMS_TRIAL_TEXT = `gratuitamente per ${TRIAL_DAYS} giorni`;

/** Durate di prova uguali alla nostra che non vanno lette da `TRIAL_DAYS`. */
const TRIAL_EXEMPT: readonly Exemption[] = [
  {
    file: TERMS_V01,
    text: TERMS_TRIAL_TEXT,
    reason:
      "testo legale versionato: una prova di durata diversa è una nuova " +
      "versione dei Termini (skill deploy-release), non un template",
  },
  {
    file: path.join("lib", "confronto", "comparisons.ts"),
    text: 'trial: "30 giorni gratis"',
    reason: "prova di CassaDigitale, un concorrente",
  },
  {
    file: path.join("lib", "guide", "articles.ts"),
    text: "tipicamente 14-30 giorni",
    reason: "durata tipica delle prove sul mercato",
  },
];

const TRIAL_CONTEXT = /prov|trial|gratis|gratuit/i;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\{\/\*)/;

function findListedPrices(source: string): string[] {
  return source.match(LISTED_PRICE) ?? [];
}

function findTrialDays(source: string): string[] {
  const code = source
    .split("\n")
    .filter((line) => !COMMENT_LINE.test(line))
    .join("\n");
  const days = new RegExp(String.raw`\b${TRIAL_DAYS} giorni\b`, "g");
  return [...code.matchAll(days)]
    .map((m) => code.slice(Math.max(0, m.index - 60), m.index + 70))
    .filter((window) => TRIAL_CONTEXT.test(window))
    .map((window) => window.replaceAll(/\s+/g, " ").trim());
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

const sourceFiles = collectSourceFiles(SRC_DIR, []).map((full) =>
  path.relative(SRC_DIR, full),
);

function handWritten(
  sourceOfTruth: string,
  exempt: readonly Exemption[],
  find: (source: string) => string[],
): string[] {
  return sourceFiles
    .filter((rel) => rel !== sourceOfTruth)
    .flatMap((rel) => {
      const source = exempt
        .filter((e) => e.file === rel)
        .reduce((text, e) => text.replaceAll(e.text, ""), read(rel));
      return find(source).map((hit) => `${rel}: ${hit}`);
    });
}

function staleExemptions(exempt: readonly Exemption[]): string[] {
  return exempt
    .filter((e) => !read(e.file).includes(e.text))
    .map((e) => `${e.file}: ${e.text}`);
}

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

describe("riconoscimento della durata della prova", () => {
  it("trova la durata scritta a mano accanto a prova, trial o gratis", () => {
    for (const copy of [
      "prova gratuita di 30 giorni senza carta",
      "Da 2,50 €/mese, 30 giorni gratis.",
      "con il trial di 30 giorni provi le funzioni Pro",
    ]) {
      expect(findTrialDays(copy)).toHaveLength(1);
    }
  });

  it("lascia stare gli altri 30 giorni e i commenti", () => {
    expect(findTrialDays("Ricavi degli ultimi 30 giorni.")).toEqual([]);
    expect(findTrialDays("Risponderemo entro 30 giorni.")).toEqual([]);
    expect(findTrialDays("  // 30 giorni bonus + 30 di trial")).toEqual([]);
    expect(findTrialDays(" * prova di 30 giorni")).toEqual([]);
  });
});

describe("fatti dei piani in un posto solo (issue #1106)", () => {
  it("scansiona le superfici che mostrano piani e prova (il gate non gira a vuoto)", () => {
    expect(sourceFiles).toEqual(
      expect.arrayContaining([
        path.join("components", "marketing", "pricing-section.tsx"),
        path.join("components", "billing", "plan-selection.tsx"),
        path.join("app", "llms.txt", "route.ts"),
        TERMS_V01,
      ]),
    );
  });

  it("nessun file fuori da plan-prices.ts scrive a mano un prezzo di listino", () => {
    expect(
      handWritten(
        path.join("lib", "plan-prices.ts"),
        PRICE_EXEMPT,
        findListedPrices,
      ),
    ).toEqual([]);
  });

  it("nessun file scrive a mano la durata della prova al posto di TRIAL_DAYS", () => {
    expect(
      handWritten(
        path.join("lib", "plans-shared.ts"),
        TRIAL_EXEMPT,
        findTrialDays,
      ),
    ).toEqual([]);
  });

  it("i Termini v01 descrivono la prova di oggi", () => {
    // Se TRIAL_DAYS cambia, questo fallisce: i Termini accettati dicono
    // un'altra durata, quindi serve una nuova versione, non un ritocco.
    expect(read(TERMS_V01)).toContain(TERMS_TRIAL_TEXT);
  });

  it("ogni esenzione trova ancora il suo testo", () => {
    expect(staleExemptions([...PRICE_EXEMPT, ...TRIAL_EXEMPT])).toEqual([]);
  });
});
