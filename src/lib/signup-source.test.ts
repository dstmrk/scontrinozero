import { describe, expect, it } from "vitest";
import {
  ALLOWED_PAGE_SOURCES,
  ALLOWED_SIGNUP_SOURCES,
  normalizeSignupSource,
} from "./signup-source";

describe("normalizeSignupSource", () => {
  it("returns the canonical value for an allowlisted source", () => {
    expect(normalizeSignupSource("reddit")).toBe("reddit");
    expect(normalizeSignupSource("linkedin")).toBe("linkedin");
    expect(normalizeSignupSource("producthunt")).toBe("producthunt");
  });

  it("normalises mixed-case input to lowercase", () => {
    expect(normalizeSignupSource("REDDIT")).toBe("reddit");
    expect(normalizeSignupSource("LinkedIn")).toBe("linkedin");
  });

  it("trims surrounding whitespace before validation", () => {
    expect(normalizeSignupSource("  reddit  ")).toBe("reddit");
    expect(normalizeSignupSource("\treddit\n")).toBe("reddit");
  });

  it("returns null for sources outside the allowlist", () => {
    expect(normalizeSignupSource("hacker")).toBeNull();
    expect(normalizeSignupSource("medium")).toBeNull();
    expect(normalizeSignupSource("competitor")).toBeNull();
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(normalizeSignupSource("")).toBeNull();
    expect(normalizeSignupSource("   ")).toBeNull();
  });

  it("returns null for null or undefined input", () => {
    expect(normalizeSignupSource(null)).toBeNull();
    expect(normalizeSignupSource(undefined)).toBeNull();
  });

  it("returns null for input exceeding the length cap", () => {
    expect(normalizeSignupSource("a".repeat(97))).toBeNull();
    expect(normalizeSignupSource("a".repeat(200))).toBeNull();
  });

  it("returns null for input containing non [a-z0-9_-] characters", () => {
    expect(normalizeSignupSource("reddit;DROP TABLE")).toBeNull();
    expect(normalizeSignupSource("red dit")).toBeNull();
    expect(normalizeSignupSource("reddit.com")).toBeNull();
    expect(normalizeSignupSource("red/dit")).toBeNull();
    expect(normalizeSignupSource("reddit?ref=foo")).toBeNull();
    expect(normalizeSignupSource("<script>")).toBeNull();
  });

  it("returns null for non-string input types", () => {
    expect(normalizeSignupSource(123 as unknown as string)).toBeNull();
    expect(normalizeSignupSource({} as unknown as string)).toBeNull();
    expect(normalizeSignupSource([] as unknown as string)).toBeNull();
  });

  it("exposes the allowlist as a frozen array", () => {
    expect(ALLOWED_SIGNUP_SOURCES).toContain("reddit");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("indiehackers");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("linkedin");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("hn");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("twitter");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("fb");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("direct");
    expect(ALLOWED_SIGNUP_SOURCES).toContain("producthunt");
  });
});

describe("sorgenti di pagina", () => {
  it("accetta le pagine marketing senza slug", () => {
    expect(normalizeSignupSource("home")).toBe("home");
    expect(normalizeSignupSource("prezzi")).toBe("prezzi");
    expect(normalizeSignupSource("confronto")).toBe("confronto");
  });

  it("accetta una pagina di contenuto pubblicata", () => {
    expect(normalizeSignupSource("guide_sanzioni-mancato-scontrino")).toBe(
      "guide_sanzioni-mancato-scontrino",
    );
    expect(normalizeSignupSource("help_api")).toBe("help_api");
  });

  it("rifiuta uno slug che non è pubblicato", () => {
    // Il set è chiuso proprio per questo: un `?ref=` inventato non deve
    // poter scrivere attribuzione falsa nella colonna.
    expect(normalizeSignupSource("guide_pagina-che-non-esiste")).toBeNull();
    expect(normalizeSignupSource("per_non-una-categoria")).toBeNull();
  });

  it("rifiuta un cluster senza slug che non sia anche una pagina indice", () => {
    // `/help` è l'unica indice senza CTA di registrazione.
    expect(normalizeSignupSource("help")).toBeNull();
    expect(normalizeSignupSource("guide")).toBe("guide");
    expect(normalizeSignupSource("strumenti")).toBe("strumenti");
    expect(normalizeSignupSource("per")).toBe("per");
  });

  it("normalizza maiuscole e spazi anche sulle pagine", () => {
    expect(normalizeSignupSource("  GUIDE_codici-natura-iva ")).toBe(
      "guide_codici-natura-iva",
    );
  });

  it("ogni sorgente dell'allowlist sopravvive alla normalizzazione", () => {
    // È il gate sul tetto di lunghezza e sul charset: uno slug nuovo troppo
    // lungo finirebbe nell'allowlist e verrebbe scartato in silenzio dal
    // validatore, cioè un `?ref=` che non attribuisce niente.
    const dropped = [...ALLOWED_PAGE_SOURCES].filter(
      (source) => normalizeSignupSource(source) !== source,
    );

    expect(dropped).toEqual([]);
  });

  it("canali e pagine non si sovrappongono", () => {
    // Una sorgente in entrambi i set renderebbe ambigua la lettura: non si
    // saprebbe se `direct` è un canale o una pagina chiamata così.
    const overlap = ALLOWED_SIGNUP_SOURCES.filter((channel) =>
      ALLOWED_PAGE_SOURCES.has(channel),
    );

    expect(overlap).toEqual([]);
  });

  it("nessuno slug pubblicato contiene il separatore", () => {
    // `_` distingue il cluster dallo slug. Uno slug che lo contenesse renderebbe
    // ambigua la lettura della colonna — e `guide_a_b` non si saprebbe più
    // ricondurre a un path. I registry non lo vietano, questo test sì.
    const withSeparator = [...ALLOWED_PAGE_SOURCES].filter(
      (source) => source.split("_").length > 2,
    );

    expect(withSeparator).toEqual([]);
  });

  it("copre tutte le superfici di contenuto, non una sola", () => {
    const clusters = new Set(
      [...ALLOWED_PAGE_SOURCES]
        .filter((source) => source.includes("_"))
        .map((source) => source.split("_")[0]),
    );

    expect([...clusters].sort()).toEqual(["guide", "help", "per", "strumenti"]);
  });
});
