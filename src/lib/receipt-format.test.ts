import { describe, expect, it } from "vitest";
import { PAYMENT_LABELS, formatReceiptPrice } from "./receipt-format";

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
