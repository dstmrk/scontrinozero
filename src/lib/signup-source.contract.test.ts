import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_PAGE_SOURCES, CONTENT_CLUSTERS } from "./signup-source";
import type { ContentCluster } from "./signup-source";

/**
 * Guardia sul contratto fra le CTA di registrazione e l'attribuzione
 * server-side (`REVIEW.md` #109).
 *
 * Il funnel Umami misura le sessioni che hanno toccato una pagina **e**
 * `/register`: non è attribuzione, e non distingue un'iscrizione da chi apre
 * il form e rinuncia. Il server lo sa, ma solo se la pagina di partenza gli
 * arriva — cioè se la CTA porta `?ref=`. Una CTA che linka `/register` nudo
 * produce una registrazione senza provenienza, e l'unico modo di accorgersene
 * è notare mesi dopo che la colonna è quasi tutta `NULL`.
 *
 * Prosa sostituita da questo gate, CLAUDE.md regola 7: una CTA nuova che
 * chiami `appHref("/register")` invece di `registerHref(...)` fa fallire
 * `npm run test`, con l'elenco dei file.
 */
const SRC_DIR = path.resolve(import.meta.dirname, "..");

/** Le superfici pubbliche da cui un visitatore può iscriversi. */
const CTA_DIRS = [
  path.join("app", "(marketing)"),
  path.join("components", "marketing"),
  path.join("components", "help"),
];

/**
 * CTA che linkano `/register` senza sorgente, ciascuna col motivo per cui la
 * pagina di partenza non è un dato.
 *
 * Un'esenzione si aggiunge solo quando la sorgente sarebbe **falsa**, non
 * quando è scomoda da passare. Le esenzioni sono verificate: una che smette di
 * corrispondere a un file con la CTA nuda fa fallire questa suite invece di
 * restare a coprire un buco.
 */
const NO_SOURCE: Readonly<Record<string, string>> = {};

function isTestFile(name: string): boolean {
  return /\.(test|spec|contract\.test)\.tsx?$/.test(name);
}

function collectSourceFiles(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !isTestFile(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function ctaFiles(): string[] {
  return CTA_DIRS.flatMap((dir) =>
    collectSourceFiles(path.join(SRC_DIR, dir), []),
  ).map((full) => path.relative(SRC_DIR, full));
}

function read(relative: string): string {
  return readFileSync(path.join(SRC_DIR, relative), "utf8");
}

/** `appHref("/register")`: la CTA cross-origin giusta, ma senza `?ref=`. */
const BARE_REGISTER = /appHref\(\s*["']\/register["']\s*\)/;

/**
 * `href="/register"` letterale: la stessa CTA senza sorgente **e** senza
 * cross-origin. Da una superficie marketing il soft routing di Next
 * renderizzerebbe `/register` sull'origin sbagliato, che è il bug
 * `captcha_hostname_mismatch` (regola 15, skill `react-patterns`). Il gate le
 * tiene insieme perché si scrivono nello stesso momento — per sbaglio — e
 * questa è la peggiore delle due: la prima perde la misura, la seconda rompe
 * l'iscrizione. È la forma che `/per` aveva, trovata da questa suite.
 */
const SOFT_REGISTER = /href=["']\/register["']/;

/**
 * Sul primo match il file conta solo se importa davvero `appHref`: un commento
 * che cita la chiamata non è una CTA. È il falso positivo che questo gate ha
 * prodotto alla prima esecuzione, su `pricing-section.tsx`, che l'href lo
 * riceve come prop da un server parent.
 */
function bareCtas(): string[] {
  return ctaFiles().filter((relative) => {
    const source = read(relative);
    const bareHelper =
      BARE_REGISTER.test(source) &&
      /import\s[^;]*\bappHref\b[^;]*from/.test(source);
    return bareHelper || SOFT_REGISTER.test(source);
  });
}

/**
 * Il primo argomento di ogni `registerHref(...)`, più il secondo quando anche
 * quello è un letterale. Su una pagina dinamica lo slug è una variabile: lì si
 * verifica il cluster, che è l'unica metà scritta a mano.
 */
function literalSources(): { file: string; source: string }[] {
  return ctaFiles().flatMap((relative) =>
    [
      ...read(relative).matchAll(
        /registerHref\(\s*["']([^"']+)["']\s*(?:,\s*(?:["']([^"']+)["'])?)?/g,
      ),
    ].map((match) => ({
      file: relative,
      source: match[2] === undefined ? match[1] : `${match[1]}_${match[2]}`,
    })),
  );
}

describe("contratto CTA /register ↔ attribuzione signup", () => {
  it("trova le CTA di registrazione sulle superfici pubbliche", () => {
    // Se questo elenco si svuota il test smette di guardare qualcosa: sarebbe
    // verde per assenza di soggetto, non per correttezza.
    expect(literalSources().length).toBeGreaterThan(0);
  });

  it("nessuna CTA linka /register senza sorgente", () => {
    expect(bareCtas().filter((relative) => !(relative in NO_SOURCE))).toEqual(
      [],
    );
  });

  it("ogni sorgente letterale è nell'allowlist del server", () => {
    // Uno slug inesistente passa il typecheck (il secondo argomento è una
    // `string`, non l'elenco degli slug) e viene scartato a runtime: la CTA
    // sembrerebbe attribuita e non lo sarebbe.
    const unknown = literalSources().filter(
      ({ source }) =>
        !ALLOWED_PAGE_SOURCES.has(source) &&
        !CONTENT_CLUSTERS.includes(source as ContentCluster),
    );

    expect(unknown).toEqual([]);
  });

  it("nessuna esenzione sopravvive alla CTA che la motivava", () => {
    const bare = new Set(bareCtas());
    const orphaned = Object.keys(NO_SOURCE).filter(
      (relative) => !bare.has(relative),
    );

    expect(orphaned).toEqual([]);
  });
});
