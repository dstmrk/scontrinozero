import { describe, expect, it } from "vitest";
import { isInvalidPreferredVatCode, VAT_CODES } from "./cassa";

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
