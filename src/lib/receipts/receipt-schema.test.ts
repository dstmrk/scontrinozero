// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SALE_LINES_MAX,
  SALE_LINES_MIN,
  saleBodySchema,
  saleLineSchema,
} from "./receipt-schema";

const validLine = {
  description: "Caffè",
  quantity: 2,
  grossUnitPrice: 1.5,
  vatCode: "22" as const,
};

const validBody = {
  lines: [validLine],
  paymentMethod: "PC" as const,
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  lotteryCode: null,
};

describe("saleLineSchema", () => {
  it("accetta una riga valida", () => {
    expect(saleLineSchema.safeParse(validLine).success).toBe(true);
  });

  it("accetta ogni vatCode ammesso", () => {
    const codes = ["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"];
    for (const vatCode of codes) {
      expect(saleLineSchema.safeParse({ ...validLine, vatCode }).success).toBe(
        true,
      );
    }
  });

  it("rifiuta description vuota", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, description: "" }).success,
    ).toBe(false);
  });

  it("rifiuta description oltre 200 caratteri", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, description: "x".repeat(201) })
        .success,
    ).toBe(false);
  });

  it("rifiuta quantity non positiva", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, quantity: 0 }).success,
    ).toBe(false);
  });

  it("rifiuta quantity con più di 3 decimali", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, quantity: 1.2345 }).success,
    ).toBe(false);
  });

  it("rifiuta quantity oltre il massimo", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, quantity: 10000 }).success,
    ).toBe(false);
  });

  it("rifiuta grossUnitPrice negativo", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, grossUnitPrice: -1 }).success,
    ).toBe(false);
  });

  it("rifiuta grossUnitPrice con più di 2 decimali", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, grossUnitPrice: 1.234 }).success,
    ).toBe(false);
  });

  it("rifiuta grossUnitPrice oltre il massimo", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, grossUnitPrice: 1_000_000 })
        .success,
    ).toBe(false);
  });

  it("rifiuta vatCode fuori enum", () => {
    expect(
      saleLineSchema.safeParse({ ...validLine, vatCode: "99" }).success,
    ).toBe(false);
  });
});

describe("saleBodySchema", () => {
  it("accetta un body valido", () => {
    expect(saleBodySchema.safeParse(validBody).success).toBe(true);
  });

  it("rifiuta lines vuoto (sotto SALE_LINES_MIN)", () => {
    expect(saleBodySchema.safeParse({ ...validBody, lines: [] }).success).toBe(
      false,
    );
  });

  it("rifiuta più di SALE_LINES_MAX righe", () => {
    const lines = Array.from({ length: SALE_LINES_MAX + 1 }, () => validLine);
    expect(saleBodySchema.safeParse({ ...validBody, lines }).success).toBe(
      false,
    );
  });

  it("rifiuta paymentMethod invalido", () => {
    expect(
      saleBodySchema.safeParse({ ...validBody, paymentMethod: "XX" }).success,
    ).toBe(false);
  });

  it("rifiuta idempotencyKey non-uuid", () => {
    expect(
      saleBodySchema.safeParse({ ...validBody, idempotencyKey: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("rifiuta lotteryCode malformato su PE", () => {
    const r = saleBodySchema.safeParse({
      ...validBody,
      paymentMethod: "PE",
      lotteryCode: "garbage",
    });
    expect(r.success).toBe(false);
  });

  it("accetta lotteryCode malformato su PC (refine permissivo)", () => {
    const r = saleBodySchema.safeParse({
      ...validBody,
      paymentMethod: "PC",
      lotteryCode: "garbage-value",
    });
    expect(r.success).toBe(true);
  });

  it("accetta lotteryCode null/omesso", () => {
    expect(
      saleBodySchema.safeParse({ ...validBody, lotteryCode: null }).success,
    ).toBe(true);
    const { lotteryCode: _omitted, ...withoutCode } = validBody;
    expect(saleBodySchema.safeParse(withoutCode).success).toBe(true);
  });

  it("espone SALE_LINES_MIN/MAX coerenti", () => {
    expect(SALE_LINES_MIN).toBe(1);
    expect(SALE_LINES_MAX).toBe(100);
  });
});

describe("saleBodySchema — sconto di riga", () => {
  const body = (
    lines: Array<Record<string, unknown>>,
    extra: Record<string, unknown> = {},
  ) => ({
    lines,
    paymentMethod: "PC" as const,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    ...extra,
  });

  const line = (extra: Record<string, unknown> = {}) => ({
    description: "Maglione",
    quantity: 1,
    grossUnitPrice: 160.65,
    vatCode: "22" as const,
    ...extra,
  });

  it("accetta una riga senza sconto", () => {
    expect(saleBodySchema.safeParse(body([line()])).success).toBe(true);
  });

  it("accetta uno sconto dentro il totale della riga", () => {
    expect(
      saleBodySchema.safeParse(body([line({ lineDiscount: 10.65 })])).success,
    ).toBe(true);
  });

  it("accetta uno sconto pari al totale della riga (riga a zero)", () => {
    // L'AdE accetta `totale` 0.00000000 (oracolo in mapper.test.ts). Resta
    // distinto da un omaggio, che non concorre al totale del documento.
    expect(
      saleBodySchema.safeParse(body([line({ lineDiscount: 160.65 })])).success,
    ).toBe(true);
  });

  it("rifiuta uno sconto oltre il totale della riga", () => {
    const result = saleBodySchema.safeParse(
      body([line({ lineDiscount: 160.66 })]),
    );
    expect(result.success).toBe(false);
  });

  it("confronta lo sconto col totale di RIGA, non col prezzo unitario", () => {
    // 3 pezzi da 40,00: uno sconto di 100,00 sta dentro i 120,00 della riga,
    // pur superando il prezzo di un singolo pezzo.
    expect(
      saleBodySchema.safeParse(
        body([line({ quantity: 3, grossUnitPrice: 40, lineDiscount: 100 })]),
      ).success,
    ).toBe(true);
  });

  it("indica QUALE riga è sbagliata", () => {
    const result = saleBodySchema.safeParse(
      body([line(), line({ lineDiscount: 999 })]),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["lines", 1, "lineDiscount"]);
    expect(result.error?.issues[0]?.message).toContain("riga 2");
  });

  it("rifiuta uno sconto con più di 2 decimali", () => {
    expect(
      saleBodySchema.safeParse(body([line({ lineDiscount: 1.005 })])).success,
    ).toBe(false);
  });

  it("rifiuta uno sconto negativo", () => {
    expect(
      saleBodySchema.safeParse(body([line({ lineDiscount: -1 })])).success,
    ).toBe(false);
  });
});

describe("saleBodySchema — pagamento misto", () => {
  const base = {
    lines: [
      { description: "Caffè", quantity: 1, grossUnitPrice: 1.9, vatCode: "10" },
    ],
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("accetta payments[] che quadra col totale delle righe", () => {
    // Caso di riferimento HAR.md voce #1: 0,50 + 1,00 + 0,40 di abbuono = 1,90.
    const parsed = saleBodySchema.safeParse({
      ...base,
      payments: [
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: 1.0 },
      ],
      globalDiscount: 0.4,
    });
    expect(parsed.success).toBe(true);
  });

  it("accetta ancora il paymentMethod scalare da solo", () => {
    // Nessun breaking change: il corpo che i client mandano oggi resta valido.
    expect(
      saleBodySchema.safeParse({ ...base, paymentMethod: "PC" }).success,
    ).toBe(true);
  });

  it("rifiuta un corpo senza né paymentMethod né payments", () => {
    const parsed = saleBodySchema.safeParse(base);
    expect(parsed.success).toBe(false);
  });

  it("rifiuta paymentMethod e payments insieme", () => {
    // Mutuamente esclusivi: due dichiarazioni dello stesso fatto possono
    // contraddirsi, e non esiste una regola sensata su chi vince.
    const parsed = saleBodySchema.safeParse({
      ...base,
      paymentMethod: "PC",
      payments: [{ type: "PC", amount: 1.9 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rifiuta una ripartizione che non quadra col totale", () => {
    // Invariante HAR.md voce #5. La voce #15 avverte che NON sappiamo se
    // l'AdE la validi lato server: la quadratura è responsabilità nostra.
    const parsed = saleBodySchema.safeParse({
      ...base,
      payments: [
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: 1.0 },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("payments");
  });

  it("rifiuta due voci dello stesso tipo", () => {
    // Il tracciato AdE ha uno slot per tipo (voce #6): due `PC` non sono
    // rappresentabili, e sommarle in silenzio nasconderebbe un errore di input.
    const parsed = saleBodySchema.safeParse({
      ...base,
      payments: [
        { type: "PC", amount: 1.0 },
        { type: "PC", amount: 0.9 },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rifiuta una ripartizione che non incassa nulla", () => {
    const parsed = saleBodySchema.safeParse({
      ...base,
      payments: [
        { type: "PC", amount: 0 },
        { type: "PE", amount: 0 },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rifiuta importi negativi o con più di 2 decimali", () => {
    expect(
      saleBodySchema.safeParse({
        ...base,
        payments: [{ type: "PE", amount: -1.9 }],
      }).success,
    ).toBe(false);
    expect(
      saleBodySchema.safeParse({
        ...base,
        payments: [{ type: "PE", amount: 1.905 }],
      }).success,
    ).toBe(false);
  });

  it("quadra in centesimi interi, non in float", () => {
    // 3 righe da 0,10 fanno 0,30: in float `0.1*3` è 0.30000000000000004 e un
    // confronto in euro rifiuterebbe una ripartizione perfettamente quadrata.
    const parsed = saleBodySchema.safeParse({
      lines: [
        { description: "a", quantity: 3, grossUnitPrice: 0.1, vatCode: "10" },
      ],
      idempotencyKey: base.idempotencyKey,
      payments: [
        { type: "PC", amount: 0.1 },
        { type: "PE", amount: 0.2 },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("refineLotteryCode — pagamento misto", () => {
  const base = {
    lines: [
      { description: "Caffè", quantity: 1, grossUnitPrice: 1.9, vatCode: "10" },
    ],
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("rifiuta il codice lotteria su un pagamento misto", () => {
    // HAR.md voce #13: ammesso solo se pagato ESCLUSIVAMENTE con mezzi
    // elettronici. Qualunque slot diverso da PE con importo > 0 squalifica.
    const parsed = saleBodySchema.safeParse({
      ...base,
      payments: [
        { type: "PC", amount: 0.9 },
        { type: "PE", amount: 1.0 },
      ],
      lotteryCode: "ABCD1234",
    });
    expect(parsed.success).toBe(false);
  });

  it("ammette il codice quando PE è l'unico importo, abbuono compreso", () => {
    // Verificato sul portale (voce #13): totale 1,90, elettronico 1,50,
    // sconto a pagare 0,40 → codice accettato. `scontoAbbuono` non è un
    // mezzo di pagamento e non entra nel test.
    const parsed = saleBodySchema.safeParse({
      ...base,
      payments: [{ type: "PE", amount: 1.5 }],
      globalDiscount: 0.4,
      lotteryCode: "ABCD1234",
    });
    expect(parsed.success).toBe(true);
  });

  it("ammette il codice su una ripartizione con lo slot contanti a zero", () => {
    const parsed = saleBodySchema.safeParse({
      ...base,
      payments: [
        { type: "PC", amount: 0 },
        { type: "PE", amount: 1.9 },
      ],
      lotteryCode: "ABCD1234",
    });
    expect(parsed.success).toBe(true);
  });
});
