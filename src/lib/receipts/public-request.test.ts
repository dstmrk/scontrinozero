import { describe, it, expect } from "vitest";
import { parsePublicRequest } from "@/lib/receipts/public-request";

describe("parsePublicRequest", () => {
  it("legge metodo di pagamento, codice lotteria e sconto a pagare", () => {
    expect(
      parsePublicRequest({
        paymentMethod: "PE",
        lotteryCode: "ABCD1234",
        globalDiscount: 0.4,
      }),
    ).toEqual({
      paymentMethod: "PE",
      lotteryCode: "ABCD1234",
      globalDiscountCents: 40,
    });
  });

  it("degrada a PC / nessuna lotteria / nessuno sconto sui documenti storici", () => {
    // Righe scritte prima che i campi esistessero: `publicRequest` è NULL o
    // contiene solo `paymentMethod`. Nessuna migrazione le tocca (jsonb).
    expect(parsePublicRequest(null)).toEqual({
      paymentMethod: "PC",
      lotteryCode: null,
      globalDiscountCents: 0,
    });
    expect(parsePublicRequest({ paymentMethod: "PC" })).toEqual({
      paymentMethod: "PC",
      lotteryCode: null,
      globalDiscountCents: 0,
    });
  });

  it("tratta un paymentMethod non riconosciuto come PC", () => {
    // Difesa: la colonna è jsonb non tipizzato, non un enum DB.
    expect(parsePublicRequest({ paymentMethod: "TR" }).paymentMethod).toBe(
      "PC",
    );
    expect(parsePublicRequest("stringa").paymentMethod).toBe("PC");
  });

  it("ignora un lotteryCode vuoto o non stringa", () => {
    expect(parsePublicRequest({ lotteryCode: "" }).lotteryCode).toBeNull();
    expect(parsePublicRequest({ lotteryCode: 42 }).lotteryCode).toBeNull();
  });

  it("restituisce lo sconto in centesimi interi, mai in float (regola 17)", () => {
    // 0.1 + 0.2 !== 0.3 in float: l'abbuono deve arrivare alle superfici di
    // lettura già in cents, così sottrarlo dal totale non introduce drift.
    expect(
      parsePublicRequest({ globalDiscount: 0.3 }).globalDiscountCents,
    ).toBe(30);
    expect(
      parsePublicRequest({ globalDiscount: 12.34 }).globalDiscountCents,
    ).toBe(1234);
  });

  it("scarta uno sconto non numerico, negativo o non finito", () => {
    expect(
      parsePublicRequest({ globalDiscount: "0.40" }).globalDiscountCents,
    ).toBe(0);
    expect(parsePublicRequest({ globalDiscount: -1 }).globalDiscountCents).toBe(
      0,
    );
    expect(
      parsePublicRequest({ globalDiscount: Number.NaN }).globalDiscountCents,
    ).toBe(0);
    expect(
      parsePublicRequest({ globalDiscount: Number.POSITIVE_INFINITY })
        .globalDiscountCents,
    ).toBe(0);
  });
});
