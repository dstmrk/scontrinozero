import { describe, expect, it } from "vitest";

import type { AdeCedentePrestatore } from "./types";
import type {
  PaymentRequest,
  SaleDocumentRequest,
  SaleLineRequest,
  VoidRequest,
} from "./public-types";

import {
  toAdeAmount,
  toAdeDate,
  computeLineAmounts,
  mapSaleToAdePayload,
  mapVoidToAdePayload,
  PAYMENT_TYPE_MAP,
} from "./mapper";

// ---------------------------------------------------------------------------
// toAdeAmount
// ---------------------------------------------------------------------------

describe("toAdeAmount", () => {
  it("formats integer to 2 decimal string", () => {
    expect(toAdeAmount(10)).toBe("10.00");
  });

  it("formats decimal to 2 decimal string", () => {
    expect(toAdeAmount(2.5)).toBe("2.50");
  });

  it("rounds to 2 decimals", () => {
    expect(toAdeAmount(1.005)).toBe("1.01");
  });

  it("handles zero", () => {
    expect(toAdeAmount(0)).toBe("0.00");
  });

  it("handles small amounts", () => {
    expect(toAdeAmount(0.01)).toBe("0.01");
  });

  it("handles large amounts", () => {
    expect(toAdeAmount(99999.99)).toBe("99999.99");
  });
});

// ---------------------------------------------------------------------------
// toAdeDate
// ---------------------------------------------------------------------------

describe("toAdeDate", () => {
  it("converts ISO date to dd/MM/yyyy", () => {
    expect(toAdeDate("2026-02-15")).toBe("15/02/2026");
  });

  it("converts first day of year", () => {
    expect(toAdeDate("2026-01-01")).toBe("01/01/2026");
  });

  it("converts last day of year", () => {
    expect(toAdeDate("2026-12-31")).toBe("31/12/2026");
  });
});

// ---------------------------------------------------------------------------
// computeLineAmounts
// ---------------------------------------------------------------------------

describe("computeLineAmounts", () => {
  it("computes amounts for a simple line with 22% IVA", () => {
    const line: SaleLineRequest = {
      description: "Prodotto",
      quantity: 1,
      unitPriceGross: 12.2,
      unitDiscount: 0,
      vatCode: "22",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    expect(result.prezzoLordo).toBe("12.20");
    expect(result.prezzoUnitario).toBe("10.00");
    expect(result.scontoUnitario).toBe("0.00");
    expect(result.scontoLordo).toBe("0.00");
    expect(result.imponibile).toBe("10.00");
    expect(result.imponibileNetto).toBe("10.00");
    expect(result.importoIVA).toBe("2.20");
    expect(result.totale).toBe("12.20");
  });

  it("computes amounts for a line with natura N2 (no IVA)", () => {
    const line: SaleLineRequest = {
      description: "Servizio esente",
      quantity: 1,
      unitPriceGross: 10,
      unitDiscount: 0,
      vatCode: "N2",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    expect(result.prezzoLordo).toBe("10.00");
    expect(result.prezzoUnitario).toBe("10.00");
    expect(result.importoIVA).toBe("0.00");
    expect(result.imponibileNetto).toBe("10.00");
    expect(result.totale).toBe("10.00");
  });

  it("computes amounts with quantity > 1", () => {
    const line: SaleLineRequest = {
      description: "Cappuccino",
      quantity: 3,
      unitPriceGross: 1.5,
      unitDiscount: 0,
      vatCode: "10",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    // prezzoLordo = unitPriceGross * quantity = 4.50
    expect(result.prezzoLordo).toBe("4.50");
    // imponibile = prezzoLordo scorporata IVA 10%: 4.50 / 1.10 = 4.09 (rounded)
    expect(result.imponibile).toBe("4.09");
    expect(result.imponibileNetto).toBe("4.09");
    // importoIVA = 4.50 - 4.09 = 0.41
    expect(result.importoIVA).toBe("0.41");
    expect(result.totale).toBe("4.50");
  });

  it("computes amounts with unit discount", () => {
    const line: SaleLineRequest = {
      description: "Prodotto scontato",
      quantity: 2,
      unitPriceGross: 10,
      unitDiscount: 2,
      vatCode: "22",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    // prezzoLordo = 10 * 2 = 20.00
    expect(result.prezzoLordo).toBe("20.00");
    // scontoLordo = 2 * 2 = 4.00
    expect(result.scontoLordo).toBe("4.00");
    // netto lordo = 20 - 4 = 16
    // imponibileNetto = 16 / 1.22 = 13.11 (rounded)
    expect(result.imponibileNetto).toBe("13.11");
    // importoIVA = 16 - 13.11 = 2.89
    expect(result.importoIVA).toBe("2.89");
    expect(result.totale).toBe("16.00");
  });

  it("marks gift line correctly", () => {
    const line: SaleLineRequest = {
      description: "Omaggio",
      quantity: 1,
      unitPriceGross: 5,
      unitDiscount: 0,
      vatCode: "22",
      isGift: true,
    };

    const result = computeLineAmounts(line);
    expect(result.omaggio).toBe("Y");
  });

  it("sets defaults for vendita (no idElementoContabile, no reso)", () => {
    const line: SaleLineRequest = {
      description: "Test",
      quantity: 1,
      unitPriceGross: 1,
      unitDiscount: 0,
      vatCode: "N1",
      isGift: false,
    };

    const result = computeLineAmounts(line);
    expect(result.idElementoContabile).toBe("");
    expect(result.resiPregressi).toBe("0.00");
    expect(result.reso).toBe("0.00");
  });
});

// ---------------------------------------------------------------------------
// PAYMENT_TYPE_MAP
// ---------------------------------------------------------------------------

describe("PAYMENT_TYPE_MAP", () => {
  it("maps all public payment types to AdE codes", () => {
    expect(PAYMENT_TYPE_MAP.CASH).toBe("PC");
    expect(PAYMENT_TYPE_MAP.ELECTRONIC).toBe("PE");
    expect(PAYMENT_TYPE_MAP.MEAL_VOUCHER).toBe("TR");
    expect(PAYMENT_TYPE_MAP.NOT_COLLECTED_INVOICE).toBe("NR_EF");
    expect(PAYMENT_TYPE_MAP.NOT_COLLECTED_SERVICE).toBe("NR_PS");
    expect(PAYMENT_TYPE_MAP.NOT_COLLECTED_CREDIT).toBe("NR_CS");
  });
});

// ---------------------------------------------------------------------------
// mapSaleToAdePayload
// ---------------------------------------------------------------------------

const mockCedentePrestatore: AdeCedentePrestatore = {
  identificativiFiscali: {
    codicePaese: "IT",
    partitaIva: "12345678901",
    codiceFiscale: "RSSMRA80A01H501A",
  },
  altriDatiIdentificativi: {
    denominazione: "",
    nome: "MARIO",
    cognome: "ROSSI",
    indirizzo: "VIA ROMA",
    numeroCivico: "1",
    cap: "00100",
    comune: "ROMA",
    provincia: "RM",
    nazione: "IT",
    modificati: false,
    defAliquotaIVA: "22",
    nuovoUtente: false,
  },
  multiAttivita: [],
  multiSede: [],
};

describe("mapSaleToAdePayload", () => {
  it("maps a simple sale to AdE payload", () => {
    const doc: SaleDocumentRequest = {
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
      payments: [{ type: "CASH", amount: 3 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const result = mapSaleToAdePayload(doc, mockCedentePrestatore);

    expect(result.datiTrasmissione.formato).toBe("DCW10");
    expect(result.flagIdentificativiModificati).toBe(false);
    expect(result.cedentePrestatore).toBe(mockCedentePrestatore);
    expect(result.idtrx).toBeUndefined();

    const dc = result.documentoCommerciale;
    expect(dc.dataOra).toBe("15/02/2026");
    expect(dc.cfCessionarioCommittente).toBe("");
    expect(dc.flagDocCommPerRegalo).toBe(false);
    expect(dc.elementiContabili).toHaveLength(1);
    expect(dc.elementiContabili[0].descrizioneProdotto).toBe("Cappuccino");
    expect(dc.elementiContabili[0].quantita).toBe("2.00");
    expect(dc.vendita).toBeDefined();
    expect(dc.vendita!.length).toBeGreaterThanOrEqual(1);
    expect(dc.resoAnnullo).toBeUndefined();
    expect(dc.numeroProgressivo).toBeUndefined();
  });

  it("includes customer tax code when provided", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      customerTaxCode: "BNCLRA80A01H501B",
      isGiftDocument: false,
      lines: [
        {
          description: "Test",
          quantity: 1,
          unitPriceGross: 10,
          unitDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
      ],
      payments: [{ type: "ELECTRONIC", amount: 10 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const result = mapSaleToAdePayload(doc, mockCedentePrestatore);
    expect(result.documentoCommerciale.cfCessionarioCommittente).toBe(
      "BNCLRA80A01H501B",
    );
  });

  it("maps multiple payment types including meal voucher with count", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      customerTaxCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Pranzo",
          quantity: 1,
          unitPriceGross: 15,
          unitDiscount: 0,
          vatCode: "10",
          isGift: false,
        },
      ],
      payments: [
        { type: "MEAL_VOUCHER", amount: 8, count: 1 },
        { type: "CASH", amount: 7 },
      ],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const result = mapSaleToAdePayload(doc, mockCedentePrestatore);
    const vendita = result.documentoCommerciale.vendita!;

    const tr = vendita.find((v) => v.tipo === "TR");
    expect(tr).toBeDefined();
    expect(tr!.importo).toBe("8.00");
    expect(tr!.numero).toBe("1");

    const pc = vendita.find((v) => v.tipo === "PC");
    expect(pc).toBeDefined();
    expect(pc!.importo).toBe("7.00");
  });

  it("fills all 6 payment slots with zero defaults", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      customerTaxCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Test",
          quantity: 1,
          unitPriceGross: 5,
          unitDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
      ],
      payments: [{ type: "CASH", amount: 5 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const result = mapSaleToAdePayload(doc, mockCedentePrestatore);
    const vendita = result.documentoCommerciale.vendita!;

    // All 6 payment slots present
    expect(vendita).toHaveLength(6);
    const tipos = vendita.map((v) => v.tipo);
    expect(tipos).toContain("PC");
    expect(tipos).toContain("PE");
    expect(tipos).toContain("TR");
    expect(tipos).toContain("NR_EF");
    expect(tipos).toContain("NR_PS");
    expect(tipos).toContain("NR_CS");
  });

  it("computes document totals correctly", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      customerTaxCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Prodotto A",
          quantity: 1,
          unitPriceGross: 10,
          unitDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
        {
          description: "Prodotto B",
          quantity: 1,
          unitPriceGross: 5,
          unitDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
      ],
      payments: [{ type: "CASH", amount: 15 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const result = mapSaleToAdePayload(doc, mockCedentePrestatore);
    const dc = result.documentoCommerciale;

    expect(dc.ammontareComplessivo).toBe("15.00");
    expect(dc.totaleImponibile).toBe("15.00");
    expect(dc.importoTotaleIva).toBe("0.00");
    expect(dc.scontoTotale).toBe("0.00");
    expect(dc.totaleNonRiscosso).toBe("0.00");
  });
});

// ---------------------------------------------------------------------------
// mapVoidToAdePayload
// ---------------------------------------------------------------------------

describe("mapVoidToAdePayload", () => {
  it("maps a void request to AdE annullo payload", () => {
    const voidReq: VoidRequest = {
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      originalDocument: {
        transactionId: "151085589",
        documentProgressive: "DCW2026/5111-2188",
        date: "2026-02-15",
      },
    };

    const result = mapVoidToAdePayload(voidReq, mockCedentePrestatore);

    expect(result.idtrx).toBe("151085589");
    expect(result.datiTrasmissione.formato).toBe("DCW10");
    expect(result.flagIdentificativiModificati).toBe(false);
    expect(result.cedentePrestatore).toBe(mockCedentePrestatore);

    const dc = result.documentoCommerciale;
    expect(dc.resoAnnullo).toBeDefined();
    expect(dc.resoAnnullo!.tipologia).toBe("A");
    expect(dc.resoAnnullo!.dataOra).toBe("15/02/2026");
    expect(dc.resoAnnullo!.progressivo).toBe("DCW2026/5111-2188");
    expect(dc.numeroProgressivo).toBe("DCW2026/5111-2188");

    // Annullo has no vendita
    expect(dc.vendita).toBeUndefined();
  });
});
