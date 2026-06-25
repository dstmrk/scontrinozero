import { describe, expect, it } from "vitest";
import { generateReferralCode, normalizeReferralCode } from "./referral-code";

describe("generateReferralCode", () => {
  it("genera un codice di 8 caratteri nell'alfabeto senza ambigui", () => {
    const code = generateReferralCode("user-1");
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("non genera caratteri ambigui (0, O, 1, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode(`seed-${i}`);
      expect(code).not.toMatch(/[01OIL]/);
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

  it("rifiuta caratteri ambigui (0, O, 1, I, L)", () => {
    expect(normalizeReferralCode("AB2CDEF0")).toBeNull();
    expect(normalizeReferralCode("AB2CDEFI")).toBeNull();
  });

  it("rifiuta caratteri non alfanumerici", () => {
    expect(normalizeReferralCode("AB2CDEF!")).toBeNull();
  });
});
