import { describe, it, expect } from "vitest";
import {
  cn,
  formatCurrency,
  parseAmount,
  appendKeypadChar,
  backspaceKeypad,
} from "./utils";

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges tailwind classes correctly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

// Normalizza spazi (incluso narrow no-break space U+202F usato da Intl in locale it-IT)
const norm = (s: string) => s.replace(/[\s\u00A0\u202F]+/g, " ").trim();

describe("formatCurrency", () => {
  it("formats zero", () => {
    expect(norm(formatCurrency(0))).toBe("0,00 €");
  });

  it("formats integer amount", () => {
    expect(norm(formatCurrency(12))).toBe("12,00 €");
  });

  it("formats decimal amount", () => {
    expect(norm(formatCurrency(12.5))).toBe("12,50 €");
  });

  it("formats large amount in euros", () => {
    // Accetta sia "1.000,00 €" che "1000,00 €" a seconda dell'ICU data presente
    expect(norm(formatCurrency(1000))).toMatch(/1\.?000,00 €/);
  });
});

describe("parseAmount", () => {
  it("returns 0 for empty string", () => {
    expect(parseAmount("")).toBe(0);
  });

  it("returns 0 for bare dot", () => {
    expect(parseAmount(".")).toBe(0);
  });

  it("parses integer string", () => {
    expect(parseAmount("12")).toBe(12);
  });

  it("parses decimal string", () => {
    expect(parseAmount("12.5")).toBe(12.5);
  });

  it("parses string with trailing dot", () => {
    expect(parseAmount("12.")).toBe(12);
  });
});

describe("appendKeypadChar", () => {
  it("appends digit to empty string", () => {
    expect(appendKeypadChar("", "7")).toBe("7");
  });

  it("appends digit to existing value", () => {
    expect(appendKeypadChar("12", "3")).toBe("123");
  });

  it("adds decimal point", () => {
    expect(appendKeypadChar("12", ".")).toBe("12.");
  });

  it("adds '0.' when pressing dot on empty string", () => {
    expect(appendKeypadChar("", ".")).toBe("0.");
  });

  it("does not add second decimal point", () => {
    expect(appendKeypadChar("12.5", ".")).toBe("12.5");
  });

  it("allows up to 2 decimal digits", () => {
    expect(appendKeypadChar("12.5", "0")).toBe("12.50");
  });

  it("does not add third decimal digit", () => {
    expect(appendKeypadChar("12.50", "3")).toBe("12.50");
  });

  it("prevents leading zeros (replaces single 0 with digit)", () => {
    expect(appendKeypadChar("0", "5")).toBe("5");
  });
});

describe("backspaceKeypad", () => {
  it("removes last character", () => {
    expect(backspaceKeypad("123")).toBe("12");
  });

  it("returns empty string on single char", () => {
    expect(backspaceKeypad("5")).toBe("");
  });

  it("returns empty string on empty string", () => {
    expect(backspaceKeypad("")).toBe("");
  });
});
