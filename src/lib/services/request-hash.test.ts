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
