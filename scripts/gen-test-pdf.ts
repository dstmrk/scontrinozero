import { generateSaleReceiptPdf } from "../src/lib/pdf/generate-sale-receipt";
import { writeFileSync } from "node:fs";

const data = {
  businessName: "Ottica Rossi di Mario Rossi",
  vatNumber: "01234567890",
  address: "Via Roma 42",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
  lines: [
    {
      description: "Occhiali da sole Ray-Ban",
      quantity: 1,
      grossUnitPrice: 120.0,
      vatCode: "22",
    },
    {
      description: "Montatura vista Gucci",
      quantity: 1,
      grossUnitPrice: 85.5,
      vatCode: "22",
    },
    {
      description: "Lenti progressive",
      quantity: 2,
      grossUnitPrice: 65.0,
      vatCode: "22",
    },
    {
      description: "Astuccio rigido",
      quantity: 1,
      grossUnitPrice: 8.0,
      vatCode: "N4",
    },
  ],
  paymentMethod: "PC" as const,
  createdAt: new Date("2026-02-23T10:30:00"),
  adeProgressive: "DCW2026/5111-2201",
  adeTransactionId: "1740306600123456789",
};

void (async () => {
  const buf = await generateSaleReceiptPdf(data);
  writeFileSync("/tmp/test-receipt.pdf", buf);
  console.log("OK — /tmp/test-receipt.pdf", buf.length, "bytes");
})();
