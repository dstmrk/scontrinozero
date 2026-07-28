import { describe, expect, it } from "vitest";
import {
  PAYMENT_LABELS,
  formatReceiptPrice,
  formatReceiptDateTime,
} from "./receipt-format";

describe("PAYMENT_LABELS", () => {
  it("usa la versione corta canonica (Contante / Elettronico)", () => {
    expect(PAYMENT_LABELS.PC).toBe("Contante");
    expect(PAYMENT_LABELS.PE).toBe("Elettronico");
  });
});

describe("formatReceiptPrice", () => {
  it("formatta in italiano senza simbolo €", () => {
    expect(formatReceiptPrice(12.5)).toBe("12,50");
    expect(formatReceiptPrice(0)).toBe("0,00");
  });

  it("forza 2 decimali anche per importi interi", () => {
    expect(formatReceiptPrice(5)).toBe("5,00");
  });

  it("arrotonda al secondo decimale", () => {
    expect(formatReceiptPrice(1.005)).toBe("1,01");
    expect(formatReceiptPrice(1.004)).toBe("1,00");
  });
});

describe("formatReceiptDateTime", () => {
  it("usa il formato DD-MM-YYYY HH:MM", () => {
    expect(formatReceiptDateTime(new Date("2026-01-15T09:05:00Z"))).toBe(
      "15-01-2026 10:05",
    );
  });

  it("rende l'ora legale italiana, non l'UTC del container", () => {
    // Luglio: Roma è UTC+2. Con getHours() in un container UTC stamperemmo 12:32.
    expect(formatReceiptDateTime(new Date("2026-07-28T12:32:00Z"))).toBe(
      "28-07-2026 14:32",
    );
  });

  it("non sbaglia il giorno a cavallo della mezzanotte italiana", () => {
    // 23:30 UTC del 27 = 01:30 del 28 a Roma: la data deve avanzare.
    expect(formatReceiptDateTime(new Date("2026-07-27T23:30:00Z"))).toBe(
      "28-07-2026 01:30",
    );
  });
});
