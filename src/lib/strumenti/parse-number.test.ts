import { describe, expect, it } from "vitest";
import { parseItalianNumber } from "./parse-number";

describe("parseItalianNumber", () => {
  it("parses plain integers", () => {
    expect(parseItalianNumber("122")).toBe(122);
    expect(parseItalianNumber("0")).toBe(0);
  });

  it("parses Italian decimal with comma", () => {
    expect(parseItalianNumber("19,99")).toBeCloseTo(19.99, 5);
    expect(parseItalianNumber("0,5")).toBeCloseTo(0.5, 5);
  });

  it("parses Italian thousands separator (dot) + decimal (comma)", () => {
    expect(parseItalianNumber("1.234,56")).toBeCloseTo(1234.56, 5);
    expect(parseItalianNumber("12.345.678,90")).toBeCloseTo(12345678.9, 5);
  });

  it("parses Italian thousands separator without decimals", () => {
    expect(parseItalianNumber("1.000")).toBe(1000);
    expect(parseItalianNumber("12.345")).toBe(12345);
    expect(parseItalianNumber("1.234.567")).toBe(1234567);
  });

  it("parses English decimal with dot when no comma is present", () => {
    expect(parseItalianNumber("19.99")).toBeCloseTo(19.99, 5);
    expect(parseItalianNumber("1234.56")).toBeCloseTo(1234.56, 5);
    expect(parseItalianNumber("1.5")).toBeCloseTo(1.5, 5);
  });

  it("trims whitespace", () => {
    expect(parseItalianNumber("  19,99  ")).toBeCloseTo(19.99, 5);
    expect(parseItalianNumber("\t1.234,56\n")).toBeCloseTo(1234.56, 5);
  });

  it("returns NaN on empty or invalid input", () => {
    expect(Number.isNaN(parseItalianNumber(""))).toBe(true);
    expect(Number.isNaN(parseItalianNumber("abc"))).toBe(true);
    expect(Number.isNaN(parseItalianNumber("   "))).toBe(true);
  });

  it("preserves sign", () => {
    expect(parseItalianNumber("-19,99")).toBeCloseTo(-19.99, 5);
    expect(parseItalianNumber("-1.234,56")).toBeCloseTo(-1234.56, 5);
  });

  it("keeps the dot decimal when the integer part is zero", () => {
    expect(parseItalianNumber("0.125")).toBeCloseTo(0.125, 5);
    expect(parseItalianNumber("0.500")).toBeCloseTo(0.5, 5);
  });

  it("preserves sign on a thousands-grouped number without comma", () => {
    expect(parseItalianNumber("-1.000")).toBe(-1000);
  });

  it("rejects mixed/ambiguous separators with multiple commas", () => {
    expect(Number.isNaN(parseItalianNumber("1,234,56"))).toBe(true);
  });

  it("rejects several dots that do not form thousands groups", () => {
    expect(Number.isNaN(parseItalianNumber("1.23.456"))).toBe(true);
    expect(Number.isNaN(parseItalianNumber("0.125.000"))).toBe(true);
  });

  it("keeps a single dot as decimal when the integer part has 4+ digits", () => {
    expect(parseItalianNumber("1234.567")).toBeCloseTo(1234.567, 5);
  });
});
