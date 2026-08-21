import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { refineGlobalDiscount } from "@/lib/receipts/global-discount-schema";

const schema = z
  .object({
    lines: z.array(
      z.object({ grossUnitPrice: z.number(), quantity: z.number() }),
    ),
    globalDiscount: z.number().optional(),
  })
  .superRefine(refineGlobalDiscount);

const line = (grossUnitPrice: number, quantity = 1) => ({
  grossUnitPrice,
  quantity,
});

describe("refineGlobalDiscount", () => {
  it("accetta un documento senza sconto a pagare", () => {
    expect(schema.safeParse({ lines: [line(1.9)] }).success).toBe(true);
  });

  it("accetta lo sconto a pagare della voce #1 di HAR.md", () => {
    // Righe 1,00 + 1,00 = 2,00... l'oracolo HAR ha totale 1,90 per via dello
    // sconto di RIGA, che qui non esiste ancora: si verifica l'abbuono 0,40
    // contro un totale righe di 1,90 ricostruito senza sconti di riga.
    const result = schema.safeParse({
      lines: [line(1.0), line(0.9)],
      globalDiscount: 0.4,
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta uno sconto a pagare pari al totale delle righe", () => {
    // Lascerebbe TUTTI e sei gli slot di pagamento a zero: forma di payload
    // mai catturata su AdE (HAR.md voce #15), e la voce #15 avverte di non
    // contare sul rifiuto AdE come rete di sicurezza. Su un documento fiscale
    // irreversibile si pretende almeno un centesimo incassato.
    const result = schema.safeParse({
      lines: [line(10)],
      globalDiscount: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta uno sconto a pagare superiore al totale delle righe", () => {
    const result = schema.safeParse({
      lines: [line(10)],
      globalDiscount: 10.01,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["globalDiscount"]);
  });

  it("accetta lo sconto che lascia esattamente un centesimo da incassare", () => {
    expect(
      schema.safeParse({ lines: [line(10)], globalDiscount: 9.99 }).success,
    ).toBe(true);
  });

  it("confronta in centesimi interi, non in float (regola 17)", () => {
    // 0.1 * 3 === 0.30000000000000004: un confronto float direbbe che 0.30
    // supera il totale di tre righe da 0,10 e rifiuterebbe uno sconto valido.
    // Qui 30 cents === 30 cents, quindi lo sconto pieno è rifiutato per la
    // regola dell'incassato > 0 e non per drift, mentre 0,29 passa.
    expect(
      schema.safeParse({
        lines: [line(0.1), line(0.1), line(0.1)],
        globalDiscount: 0.29,
      }).success,
    ).toBe(true);
  });
});
