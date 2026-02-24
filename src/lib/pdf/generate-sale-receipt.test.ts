// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  generateSaleReceiptPdf,
  type SaleReceiptPdfData,
} from "./generate-sale-receipt";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_DATA: SaleReceiptPdfData = {
  businessName: "Trattoria da Mario",
  vatNumber: "12345678901",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
  lines: [
    {
      description: "Pizza Margherita",
      quantity: 2,
      grossUnitPrice: 8.5,
      vatCode: "10",
    },
    {
      description: "Acqua minerale",
      quantity: 1,
      grossUnitPrice: 2.0,
      vatCode: "22",
    },
  ],
  paymentMethod: "PC",
  createdAt: new Date("2026-02-15T12:30:00Z"),
  adeProgressive: "DCW2026/5111-0042",
  adeTransactionId: "TRX-0042",
};

// ---------------------------------------------------------------------------
// generateSaleReceiptPdf — integration test (real pdfkit, node env)
// ---------------------------------------------------------------------------

describe("generateSaleReceiptPdf", () => {
  it("returns a non-empty Buffer with valid PDF magic number (%PDF)", async () => {
    const buf = await generateSaleReceiptPdf(BASE_DATA);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    // Every valid PDF starts with the ASCII bytes for "%PDF"
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("includes the business name, VAT number and progressive in the raw PDF text", async () => {
    const buf = await generateSaleReceiptPdf(BASE_DATA);
    const text = buf.toString("latin1");
    expect(text).toContain("Trattoria da Mario");
    expect(text).toContain("12345678901");
    expect(text).toContain("DCW2026/5111-0042");
  });

  it("works without optional address fields (null values)", async () => {
    const buf = await generateSaleReceiptPdf({
      ...BASE_DATA,
      address: null,
      city: null,
      province: null,
      zipCode: null,
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("works with a single line item", async () => {
    const buf = await generateSaleReceiptPdf({
      ...BASE_DATA,
      lines: [
        {
          description: "Espresso",
          quantity: 1,
          grossUnitPrice: 1.0,
          vatCode: "22",
        },
      ],
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("works with exempt VAT codes (N1-N6, no VAT amount)", async () => {
    const buf = await generateSaleReceiptPdf({
      ...BASE_DATA,
      lines: [
        {
          description: "Prestazione esente",
          quantity: 1,
          grossUnitPrice: 100.0,
          vatCode: "N4",
        },
      ],
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("works with electronic payment method", async () => {
    const buf = await generateSaleReceiptPdf({
      ...BASE_DATA,
      paymentMethod: "PE",
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("generates a larger buffer with more line items", async () => {
    const manyLines = Array.from({ length: 10 }, (_, i) => ({
      description: `Articolo ${i + 1}`,
      quantity: 1,
      grossUnitPrice: 5.0 + i,
      vatCode: "22" as const,
    }));
    const buf = await generateSaleReceiptPdf({ ...BASE_DATA, lines: manyLines });
    const bufSingle = await generateSaleReceiptPdf({
      ...BASE_DATA,
      lines: [manyLines[0]],
    });
    // More lines → larger document
    expect(buf.length).toBeGreaterThan(bufSingle.length);
  });
});

// ---------------------------------------------------------------------------
// computeVatAmount — tested indirectly via the generated PDF content,
// but we can also verify it through the exported helper by testing the
// generate function with known VAT totals.
// ---------------------------------------------------------------------------

describe("VAT calculation correctness", () => {
  it("does not include VAT line for N-codes (non-taxable)", async () => {
    // N4 is "Esente" — vatCode has no numeric rate, vatAmount should be 0
    const buf = await generateSaleReceiptPdf({
      ...BASE_DATA,
      lines: [
        { description: "Esente", quantity: 1, grossUnitPrice: 50, vatCode: "N4" },
      ],
    });
    // The PDF should NOT contain "di cui IVA" because the VAT amount is 0
    const text = buf.toString("latin1");
    expect(text).not.toContain("di cui IVA");
  });

  it("includes a VAT breakdown line for standard 22% rate", async () => {
    const buf = await generateSaleReceiptPdf({
      ...BASE_DATA,
      lines: [
        { description: "Prodotto", quantity: 1, grossUnitPrice: 12.2, vatCode: "22" },
      ],
    });
    const text = buf.toString("latin1");
    // Should contain the VAT breakdown text
    expect(text).toContain("di cui IVA");
  });
});
