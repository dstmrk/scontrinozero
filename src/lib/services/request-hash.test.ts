// @vitest-environment node
import { describe, it, expect } from "vitest";

import { hashSaleRequest } from "./request-hash";
import type { SubmitReceiptInput } from "@/types/cassa";

const LINE: SubmitReceiptInput["lines"][number] = {
  id: "l1",
  description: "Pizza",
  quantity: 2,
  grossUnitPrice: 10.0,
  vatCode: "10",
};

const BASE = {
  lines: [LINE],
  paymentMethod: "PC" as const,
  lotteryCode: null,
};

describe("hashSaleRequest", () => {
  it("produce lo stesso hash per payload identici", () => {
    expect(hashSaleRequest(BASE)).toBe(hashSaleRequest(BASE));
  });

  it("ignora la formattazione numerica equivalente (10 vs 10.0)", () => {
    const a = hashSaleRequest({
      ...BASE,
      lines: [{ ...LINE, grossUnitPrice: 10 }],
    });
    const b = hashSaleRequest({
      ...BASE,
      lines: [{ ...LINE, grossUnitPrice: 10.0 }],
    });
    expect(a).toBe(b);
  });

  it("differisce se cambia un importo", () => {
    const a = hashSaleRequest(BASE);
    const b = hashSaleRequest({
      ...BASE,
      lines: [{ ...LINE, grossUnitPrice: 12.0 }],
    });
    expect(a).not.toBe(b);
  });

  it("differisce se cambia il metodo di pagamento", () => {
    expect(hashSaleRequest(BASE)).not.toBe(
      hashSaleRequest({ ...BASE, paymentMethod: "PE" }),
    );
  });

  it("differisce se cambia il codice lotteria", () => {
    expect(hashSaleRequest(BASE)).not.toBe(
      hashSaleRequest({ ...BASE, lotteryCode: "YYWLR30G" }),
    );
  });

  it("differisce se cambia l'ordine delle righe (l'ordine è significativo)", () => {
    const line2 = {
      ...LINE,
      id: "l2",
      description: "Birra",
      grossUnitPrice: 5,
    };
    const a = hashSaleRequest({ ...BASE, lines: [LINE, line2] });
    const b = hashSaleRequest({ ...BASE, lines: [line2, LINE] });
    expect(a).not.toBe(b);
  });

  it("ritorna un digest SHA-256 esadecimale (64 char)", () => {
    expect(hashSaleRequest(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashSaleRequest — sconto a pagare", () => {
  const base = {
    lines: [
      {
        id: "1",
        description: "Caffè",
        quantity: 1,
        grossUnitPrice: 1.9,
        vatCode: "10" as const,
      },
    ],
    paymentMethod: "PC" as const,
    lotteryCode: null,
  };

  it("non cambia l'hash degli scontrini senza abbuono", () => {
    // Gli hash già persistiti sono immutabili: un documento senza sconto deve
    // produrre lo stesso fingerprint di prima che il campo esistesse,
    // altrimenti il retry di un PENDING pre-deploy fallisce come mismatch.
    expect(hashSaleRequest({ ...base, globalDiscount: 0 })).toBe(
      hashSaleRequest(base),
    );
    expect(hashSaleRequest({ ...base, globalDiscount: undefined })).toBe(
      hashSaleRequest(base),
    );
  });

  it("fa divergere l'hash quando l'abbuono cambia", () => {
    const a = hashSaleRequest({ ...base, globalDiscount: 0.4 });
    const b = hashSaleRequest({ ...base, globalDiscount: 0.5 });
    expect(a).not.toBe(hashSaleRequest(base));
    expect(a).not.toBe(b);
  });
});
