import { describe, expect, it } from "vitest";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import type { ReceiptListItem } from "@/types/storico";
import { toPrintableReceipt } from "./storico-printable";

const PROFILE: ReceiptPrintProfile = {
  header: {
    businessName: "Bar Mario",
    vatNumber: "12345678901",
    address: null,
    city: null,
    province: null,
    zipCode: null,
  },
  footerNote: "Grazie!",
};

const SALE: ReceiptListItem = {
  origin: "local",
  id: "sale-1",
  kind: "SALE",
  status: "ACCEPTED",
  adeProgressive: "DCW2026/5111-2188",
  adeTransactionId: "trx-1",
  createdAt: new Date("2026-01-01T09:59:57Z"),
  adeRegisteredAt: new Date("2026-01-01T10:00:00Z"),
  voidDocument: null,
  returnOf: null,
  paymentMethod: "PC",
  payments: null,
  lotteryCode: null,
  globalDiscountCents: 0,
  total: "6.00",
  lines: [
    {
      description: "Caffè",
      quantity: "1",
      grossUnitPrice: "6.00",
      lineDiscount: "0",
      vatCode: "22",
      returnedQuantity: "0",
    },
  ],
};

const ORIGIN = "https://app.example";

describe("toPrintableReceipt", () => {
  it("senza intestazione stampabile ripiega sul PDF", () => {
    expect(toPrintableReceipt(SALE, null, ORIGIN)).toBeNull();
  });

  it("senza righe ripiega sul PDF", () => {
    expect(
      toPrintableReceipt({ ...SALE, lines: [] }, PROFILE, ORIGIN),
    ).toBeNull();
  });

  it("una vendita porta il messaggio di cortesia e il link pubblico", () => {
    const printed = toPrintableReceipt(SALE, PROFILE, ORIGIN);
    if (printed?.kind !== "SALE") throw new Error("attesa una vendita");
    expect(printed.footerNote).toBe("Grazie!");
    expect(printed.publicUrl).toBe("https://app.example/r/sale-1");
  });

  it("un reso cita la vendita e linka se stesso", () => {
    const printed = toPrintableReceipt(
      {
        ...SALE,
        id: "return-1",
        kind: "RETURN",
        returnOf: {
          id: "sale-1",
          adeProgressive: "DCW2026/5111-2188",
          adeRegisteredAt: new Date("2026-01-01T10:00:00Z"),
        },
      },
      PROFILE,
      ORIGIN,
    );
    if (printed?.kind !== "RETURN") throw new Error("atteso un reso");
    expect(printed.referenceDocument.adeProgressive).toBe("DCW2026/5111-2188");
    expect(printed.publicUrl).toBe("https://app.example/r/return-1");
  });

  it("un reso senza vendita ripiega sul PDF", () => {
    expect(
      toPrintableReceipt({ ...SALE, kind: "RETURN" }, PROFILE, ORIGIN),
    ).toBeNull();
  });
});
