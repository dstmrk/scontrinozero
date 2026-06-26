import { describe, expect, it } from "vitest";
import { generateReferralCode, normalizeReferralCode } from "./referral-code";

const ALPHABET_RE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

describe("generateReferralCode", () => {
  it("genera un codice di 8 caratteri nell'alfabeto Crockford base32", () => {
    const code = generateReferralCode("user-1");
    expect(code).toMatch(ALPHABET_RE);
  });

  it("genera SEMPRE 8 caratteri validi, mai 'undefined' o simboli fuori alfabeto (regression: alfabeto a 32 simboli, indice 5-bit 0–31 sempre mappato)", () => {
    // Con un alfabeto a 31 simboli ~22% dei seed produceva la stringa
    // letterale "undefined" (indice 31 → ALPHABET[31] === undefined). Copre
    // abbastanza seed da incontrare con certezza un indice 31 in ogni posizione.
    for (let i = 0; i < 2000; i++) {
      const code = generateReferralCode(`seed-${i}`);
      expect(code).toMatch(ALPHABET_RE);
      expect(code).not.toContain("undefined");
    }
  });

  it("non genera caratteri ambigui (O, I, L, U)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode(`seed-${i}`);
      expect(code).not.toMatch(/[OILU]/);
    }
  });

  it("è deterministico: lo stesso seed produce sempre lo stesso codice", () => {
    const seed = "11111111-1111-1111-1111-111111111111";
    expect(generateReferralCode(seed)).toBe(generateReferralCode(seed));
  });

  it("seed diversi producono codici diversi", () => {
    const codes = new Set(
      Array.from({ length: 50 }, (_, i) => generateReferralCode(`seed-${i}`)),
    );
    expect(codes.size).toBe(50);
  });
});

describe("normalizeReferralCode", () => {
  it("accetta un codice valido e lo normalizza in maiuscolo", () => {
    expect(normalizeReferralCode("ab2cdefg")).toBe("AB2CDEFG");
  });

  it("accetta cifre 0 e 1 (non ambigue: O e I non sono nell'alfabeto)", () => {
    expect(normalizeReferralCode("01234567")).toBe("01234567");
  });

  it("ignora spazi superflui", () => {
    expect(normalizeReferralCode("  AB2CDEFG  ")).toBe("AB2CDEFG");
  });

  it("rifiuta input non stringa", () => {
    expect(normalizeReferralCode(null)).toBeNull();
    expect(normalizeReferralCode(undefined)).toBeNull();
  });

  it("rifiuta stringa vuota", () => {
    expect(normalizeReferralCode("")).toBeNull();
  });

  it("rifiuta lunghezza errata", () => {
    expect(normalizeReferralCode("AB2CDEF")).toBeNull();
    expect(normalizeReferralCode("AB2CDEFGH")).toBeNull();
  });

  it("rifiuta caratteri ambigui esclusi dall'alfabeto (O, I, L, U)", () => {
    expect(normalizeReferralCode("AB2CDEFO")).toBeNull();
    expect(normalizeReferralCode("AB2CDEFI")).toBeNull();
    expect(normalizeReferralCode("AB2CDEFL")).toBeNull();
    expect(normalizeReferralCode("AB2CDEFU")).toBeNull();
  });

  it("rifiuta caratteri non alfanumerici", () => {
    expect(normalizeReferralCode("AB2CDEF!")).toBeNull();
  });
});
