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

describe("hashSaleRequest — simmetria fra i due call site (regressione)", () => {
  const line = (lineDiscount?: number) => ({
    id: "1",
    description: "Caffè",
    quantity: 1,
    grossUnitPrice: 2,
    vatCode: "10" as const,
    ...(lineDiscount === undefined ? {} : { lineDiscount }),
  });

  it("normalizza l'abbuono, così grezzo e arrotondato danno lo stesso hash", () => {
    // L'INSERT passava `Math.round(x * 100) / 100`, il ricalcolo sul
    // conflitto passava il valore grezzo: due input logicamente identici
    // producevano hash diversi e un retry legittimo diventava
    // IDEMPOTENCY_PAYLOAD_MISMATCH.
    const base = {
      lines: [line()],
      paymentMethod: "PC" as const,
      lotteryCode: null,
    };
    expect(hashSaleRequest({ ...base, globalDiscount: 0.4 })).toBe(
      hashSaleRequest({ ...base, globalDiscount: 0.4000000000000001 }),
    );
  });

  it("fa divergere l'hash quando cambia lo sconto DI RIGA", () => {
    // Senza `lineDiscount` nella forma canonica, due scontrini con la stessa
    // key ma sconti di riga diversi passavano per replay: il secondo tornava
    // il documento del primo, con un corrispettivo diverso da quello chiesto.
    const base = { paymentMethod: "PC" as const, lotteryCode: null };
    const a = hashSaleRequest({ ...base, lines: [line(0.5)] });
    const b = hashSaleRequest({ ...base, lines: [line(1)] });
    expect(a).not.toBe(b);
  });

  it("non cambia l'hash delle righe senza sconto", () => {
    // Gli hash già persistiti sono immutabili: una riga senza sconto deve
    // produrre lo stesso fingerprint di prima che il campo esistesse.
    const base = { paymentMethod: "PC" as const, lotteryCode: null };
    const senzaCampo = hashSaleRequest({ ...base, lines: [line()] });
    expect(hashSaleRequest({ ...base, lines: [line(0)] })).toBe(senzaCampo);
  });
});

describe("hashSaleRequest — pagamento misto", () => {
  const lines = [
    {
      id: "1",
      description: "Caffè",
      quantity: 1,
      grossUnitPrice: 1.9,
      vatCode: "10" as const,
    },
  ];

  it("non cambia l'hash di uno scontrino senza ripartizione", () => {
    // Gli hash già persistiti sono immutabili: includere sempre `payments`
    // farebbe fallire come IDEMPOTENCY_PAYLOAD_MISMATCH il retry di uno
    // scontrino PENDING inviato prima del deploy — cioè proprio il caso in
    // cui la stessa key va riusata per non rischiare un doppione fiscale.
    const withoutField = hashSaleRequest({
      lines,
      paymentMethod: "PC",
      lotteryCode: null,
    });
    const withEmpty = hashSaleRequest({
      lines,
      paymentMethod: "PC",
      payments: [],
      lotteryCode: null,
    });
    expect(withEmpty).toBe(withoutField);
  });

  it("dà lo stesso hash a due input che descrivono lo stesso documento", () => {
    // Forma canonica, non array grezzo: uno slot a zero e l'ordine di
    // inserimento non cambiano il documento. Sull'array grezzo il retry di uno
    // scontrino PENDING fallirebbe come IDEMPOTENCY_PAYLOAD_MISMATCH, cioè
    // proprio quando la stessa key va riusata per non rischiare un doppione.
    const canonical = hashSaleRequest({
      lines,
      paymentMethod: undefined,
      payments: [
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: 1.4 },
      ],
      lotteryCode: null,
    });
    const reordered = hashSaleRequest({
      lines,
      paymentMethod: undefined,
      payments: [
        { type: "PE", amount: 1.4 },
        { type: "PC", amount: 0.5 },
      ],
      lotteryCode: null,
    });
    const withZeroSlot = hashSaleRequest({
      lines,
      paymentMethod: undefined,
      payments: [
        { type: "PC", amount: 0 },
        { type: "PE", amount: 1.9 },
      ],
      lotteryCode: null,
    });
    const withoutZeroSlot = hashSaleRequest({
      lines,
      paymentMethod: undefined,
      payments: [{ type: "PE", amount: 1.9 }],
      lotteryCode: null,
    });

    expect(reordered).toBe(canonical);
    expect(withZeroSlot).toBe(withoutZeroSlot);
  });

  it("distingue due ripartizioni diverse dello stesso totale", () => {
    const a = hashSaleRequest({
      lines,
      paymentMethod: undefined,
      payments: [
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: 1.4 },
      ],
      lotteryCode: null,
    });
    const b = hashSaleRequest({
      lines,
      paymentMethod: undefined,
      payments: [
        { type: "PC", amount: 1.4 },
        { type: "PE", amount: 0.5 },
      ],
      lotteryCode: null,
    });
    expect(a).not.toBe(b);
  });

  it("distingue un misto da un metodo singolo dello stesso importo", () => {
    const mixed = hashSaleRequest({
      lines,
      paymentMethod: undefined,
      payments: [{ type: "PE", amount: 1.9 }],
      lotteryCode: null,
    });
    const single = hashSaleRequest({
      lines,
      paymentMethod: "PE",
      lotteryCode: null,
    });
    expect(mixed).not.toBe(single);
  });
});
