import { describe, it, expect } from "vitest";
import {
  cn,
  formatCurrency,
  formatDate,
  appendDigitCents,
  backspaceCents,
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

  it("accetta una stringa numerica e produce lo stesso output di un number", () => {
    expect(norm(formatCurrency("12.50"))).toBe("12,50 €");
    expect(norm(formatCurrency("12.50"))).toBe(norm(formatCurrency(12.5)));
  });

  it("ritorna 'NaN €' se la stringa non è numerica", () => {
    expect(norm(formatCurrency("non-num"))).toBe("NaN €");
  });
});

describe("formatDate", () => {
  it("default 'numeric' produce DD/MM/YYYY", () => {
    expect(formatDate(new Date("2026-05-20T00:00:00Z"))).toBe("20/05/2026");
  });

  it("opzione '2-digit' produce DD/MM/YY", () => {
    expect(formatDate(new Date("2026-05-20T00:00:00Z"), "2-digit")).toBe(
      "20/05/26",
    );
  });

  it("accetta una stringa ISO", () => {
    expect(formatDate("2026-05-20T00:00:00Z")).toBe("20/05/2026");
  });
});

describe("appendDigitCents", () => {
  it("aggiunge la prima cifra (0 → 1 = 1 centesimo)", () => {
    expect(appendDigitCents(0, "1")).toBe(1);
  });

  it("aggiunge cifra a valore esistente (1 → 3 = 13 centesimi)", () => {
    expect(appendDigitCents(1, "3")).toBe(13);
  });

  it("sequenza completa 1→3→5→8 = 1358 centesimi (€13,58)", () => {
    let cents = 0;
    cents = appendDigitCents(cents, "1");
    cents = appendDigitCents(cents, "3");
    cents = appendDigitCents(cents, "5");
    cents = appendDigitCents(cents, "8");
    expect(cents).toBe(1358);
  });

  it("aggiunge zero (1 → 0 = 10 centesimi)", () => {
    expect(appendDigitCents(1, "0")).toBe(10);
  });

  it("non supera il massimo di 999999 centesimi (€9.999,99)", () => {
    expect(appendDigitCents(999999, "5")).toBe(999999);
  });

  it("non supera il massimo anche con cifra che produrrebbe overflow", () => {
    // 100000 * 10 + 1 = 1000001 > 999999 → ritorna il valore originale
    expect(appendDigitCents(100000, "1")).toBe(100000);
    // 100001 * 10 + 0 = 1000010 > 999999 → ritorna il valore originale
    expect(appendDigitCents(100001, "0")).toBe(100001);
    // 99999 * 10 + 9 = 999999 → esattamente al limite, accettato
    expect(appendDigitCents(99999, "9")).toBe(999999);
  });

  it("da zero con zero rimane zero", () => {
    expect(appendDigitCents(0, "0")).toBe(0);
  });
});

describe("backspaceCents", () => {
  it("rimuove l'ultima cifra (1358 → 135)", () => {
    expect(backspaceCents(1358)).toBe(135);
  });

  it("sequenza completa di backspace: 1358→135→13→1→0", () => {
    expect(backspaceCents(1358)).toBe(135);
    expect(backspaceCents(135)).toBe(13);
    expect(backspaceCents(13)).toBe(1);
    expect(backspaceCents(1)).toBe(0);
  });

  it("backspace su 0 rimane 0", () => {
    expect(backspaceCents(0)).toBe(0);
  });

  it("backspace su 10 → 1", () => {
    expect(backspaceCents(10)).toBe(1);
  });
});
