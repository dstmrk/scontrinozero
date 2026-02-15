import { describe, expect, it } from "vitest";

import { saleRequestSchema, voidRequestSchema } from "./validation";

// ---------------------------------------------------------------------------
// saleRequestSchema
// ---------------------------------------------------------------------------

describe("saleRequestSchema", () => {
  const validSale = {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    document: {
      date: "2026-02-15",
      customerTaxCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Cappuccino",
          quantity: 2,
          unitPriceGross: 1.5,
          unitDiscount: 0,
          vatCode: "10",
          isGift: false,
        },
      ],
      payments: [{ type: "CASH", amount: 3.0 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    },
  };

  it("accepts a valid sale request", () => {
    const result = saleRequestSchema.safeParse(validSale);
    expect(result.success).toBe(true);
  });

  it("rejects missing idempotencyKey", () => {
    const { idempotencyKey: _, ...noKey } = validSale;
    const result = saleRequestSchema.safeParse(noKey);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID idempotencyKey", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      idempotencyKey: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty lines array", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: { ...validSale.document, lines: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects quantity <= 0", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: {
        ...validSale.document,
        lines: [{ ...validSale.document.lines[0], quantity: 0 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative unitPriceGross", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: {
        ...validSale.document,
        lines: [{ ...validSale.document.lines[0], unitPriceGross: -1 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid vatCode", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: {
        ...validSale.document,
        lines: [{ ...validSale.document.lines[0], vatCode: "99" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid vatCodes", () => {
    const validCodes = [
      "4",
      "5",
      "10",
      "22",
      "N1",
      "N2",
      "N3",
      "N4",
      "N5",
      "N6",
      "2",
      "6.4",
      "7",
      "7.3",
      "7.5",
      "7.65",
      "7.95",
      "8.3",
      "8.5",
      "8.8",
      "9.5",
      "12.3",
    ];

    for (const code of validCodes) {
      const result = saleRequestSchema.safeParse({
        ...validSale,
        document: {
          ...validSale.document,
          lines: [{ ...validSale.document.lines[0], vatCode: code }],
        },
      });
      expect(result.success, `vatCode "${code}" should be valid`).toBe(true);
    }
  });

  it("rejects description longer than 1000 chars", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: {
        ...validSale.document,
        lines: [
          { ...validSale.document.lines[0], description: "a".repeat(1001) },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid payment type", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: {
        ...validSale.document,
        payments: [{ type: "BITCOIN", amount: 3 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty payments", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: { ...validSale.document, payments: [] },
    });
    expect(result.success).toBe(false);
  });

  it("accepts meal voucher with count", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: {
        ...validSale.document,
        payments: [{ type: "MEAL_VOUCHER", amount: 3, count: 1 }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: { ...validSale.document, date: "15/02/2026" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts customer tax code as string", () => {
    const result = saleRequestSchema.safeParse({
      ...validSale,
      document: {
        ...validSale.document,
        customerTaxCode: "RSSMRA80A01H501A",
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// voidRequestSchema
// ---------------------------------------------------------------------------

describe("voidRequestSchema", () => {
  const validVoid = {
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
    originalDocument: {
      transactionId: "151085589",
      documentProgressive: "DCW2026/5111-2188",
      date: "2026-02-15",
    },
  };

  it("accepts a valid void request", () => {
    const result = voidRequestSchema.safeParse(validVoid);
    expect(result.success).toBe(true);
  });

  it("rejects missing transactionId", () => {
    const result = voidRequestSchema.safeParse({
      ...validVoid,
      originalDocument: {
        documentProgressive: "DCW2026/5111-2188",
        date: "2026-02-15",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing documentProgressive", () => {
    const result = voidRequestSchema.safeParse({
      ...validVoid,
      originalDocument: {
        transactionId: "151085589",
        date: "2026-02-15",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty transactionId", () => {
    const result = voidRequestSchema.safeParse({
      ...validVoid,
      originalDocument: { ...validVoid.originalDocument, transactionId: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = voidRequestSchema.safeParse({
      ...validVoid,
      originalDocument: { ...validVoid.originalDocument, date: "15-02-2026" },
    });
    expect(result.success).toBe(false);
  });
});
