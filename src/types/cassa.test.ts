import { describe, expect, it } from "vitest";
import {
  isInvalidPreferredVatCode,
  isValidPreferredVatCode,
  VAT_CODES,
} from "./cassa";

describe("isInvalidPreferredVatCode", () => {
  it("returns false for null (no preference is always valid)", () => {
    expect(isInvalidPreferredVatCode(null)).toBe(false);
  });

  it.each(VAT_CODES)("returns false for valid VAT code %s", (code) => {
    expect(isInvalidPreferredVatCode(code)).toBe(false);
  });

  it("returns true for an unknown code", () => {
    expect(isInvalidPreferredVatCode("99")).toBe(true);
  });

  it("returns true for an empty string (only null means no preference)", () => {
    expect(isInvalidPreferredVatCode("")).toBe(true);
  });

  it("is case-sensitive (rejects lowercase natura codes)", () => {
    expect(isInvalidPreferredVatCode("n2")).toBe(true);
  });

  it("rejects prototype-chain names", () => {
    expect(isInvalidPreferredVatCode("toString")).toBe(true);
    expect(isInvalidPreferredVatCode("__proto__")).toBe(true);
    expect(isInvalidPreferredVatCode("constructor")).toBe(true);
  });
});

describe("isValidPreferredVatCode", () => {
  it("accetta stringa vuota (nessuna preferenza)", () => {
    expect(isValidPreferredVatCode("")).toBe(true);
  });

  it.each(VAT_CODES)("accetta il codice valido %s", (code) => {
    expect(isValidPreferredVatCode(code)).toBe(true);
  });

  it("rifiuta null", () => {
    expect(isValidPreferredVatCode(null)).toBe(false);
  });

  it("rifiuta undefined", () => {
    expect(isValidPreferredVatCode(undefined)).toBe(false);
  });

  it("rifiuta numeri", () => {
    expect(isValidPreferredVatCode(22)).toBe(false);
  });

  it("rifiuta codici sconosciuti", () => {
    expect(isValidPreferredVatCode("99")).toBe(false);
    expect(isValidPreferredVatCode("N99")).toBe(false);
  });

  it("è case-sensitive (rifiuta minuscole)", () => {
    expect(isValidPreferredVatCode("n2")).toBe(false);
  });

  it("rifiuta i nomi del prototype chain", () => {
    expect(isValidPreferredVatCode("toString")).toBe(false);
    expect(isValidPreferredVatCode("__proto__")).toBe(false);
    expect(isValidPreferredVatCode("constructor")).toBe(false);
    expect(isValidPreferredVatCode("hasOwnProperty")).toBe(false);
  });
});
