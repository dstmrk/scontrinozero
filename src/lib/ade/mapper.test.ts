import { describe, expect, it } from "vitest";

import type { AdeCedentePrestatore, AdeDocumentDetail } from "./types";
import type {
  SaleDocumentRequest,
  SaleLineRequest,
  VoidRequest,
} from "./public-types";

import {
  toAdeAmount,
  toAdeAmount8,
  toAdeDate,
  computeLineAmounts,
  buildCedenteFromBusiness,
  mapSaleToAdePayload,
  mapVoidToAdePayload,
  PAYMENT_TYPE_MAP,
} from "./mapper";
import type { BusinessCedenteData } from "./mapper";

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
// toAdeAmount8
// ---------------------------------------------------------------------------

describe("toAdeAmount8", () => {
  it("formats integer to 8 decimal string", () => {
    expect(toAdeAmount8(10)).toBe("10.00000000");
  });

  it("formats decimal to 8 decimal string", () => {
    expect(toAdeAmount8(3.2)).toBe("3.20000000");
  });

  it("handles zero", () => {
    expect(toAdeAmount8(0)).toBe("0.00000000");
  });

  it("handles amounts with many decimals", () => {
    expect(toAdeAmount8(1.5)).toBe("1.50000000");
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
      lineDiscount: 0,
      vatCode: "22",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    // Monetary fields use 8 decimal places (HAR finding: vendita.har)
    expect(result.prezzoLordo).toBe("12.20000000");
    expect(result.prezzoUnitario).toBe("10.00000000");
    expect(result.scontoUnitario).toBe("0.00000000");
    expect(result.scontoLordo).toBe("0.00000000");
    expect(result.imponibile).toBe("10.00000000");
    expect(result.imponibileNetto).toBe("10.00000000");
    expect(result.importoIVA).toBe("2.20000000");
    expect(result.totale).toBe("12.20000000");
  });

  it("computes amounts for a line with natura N2 (no IVA)", () => {
    const line: SaleLineRequest = {
      description: "Servizio esente",
      quantity: 1,
      unitPriceGross: 10,
      lineDiscount: 0,
      vatCode: "N2",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    expect(result.prezzoLordo).toBe("10.00000000");
    expect(result.prezzoUnitario).toBe("10.00000000");
    expect(result.importoIVA).toBe("0.00000000");
    expect(result.imponibileNetto).toBe("10.00000000");
    expect(result.totale).toBe("10.00000000");
  });

  it("computes amounts with quantity > 1", () => {
    const line: SaleLineRequest = {
      description: "Cappuccino",
      quantity: 3,
      unitPriceGross: 1.5,
      lineDiscount: 0,
      vatCode: "10",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    // prezzoLordo e' il prezzo UNITARIO, non moltiplicato per la quantita
    // (HAR.md voce #12): la quantita entra in imponibile, non qui.
    expect(result.prezzoLordo).toBe("1.50000000");
    // prezzoUnitario = 1.50 / 1.10, a piena precisione (HAR.md voce #10)
    expect(result.prezzoUnitario).toBe("1.36363636");
    // imponibile = prezzoUnitario * quantita = 4.50 / 1.10
    expect(result.imponibile).toBe("4.09090909");
    expect(result.imponibileNetto).toBe("4.09090909");
    // importoIVA = imponibileNetto * 10 / 100
    expect(result.importoIVA).toBe("0.40909091");
    expect(result.totale).toBe("4.50000000");
  });

  it("computes amounts with line discount", () => {
    const line: SaleLineRequest = {
      description: "Prodotto scontato",
      quantity: 2,
      unitPriceGross: 10,
      lineDiscount: 4,
      vatCode: "22",
      isGift: false,
    };

    const result = computeLineAmounts(line);

    // prezzoLordo = prezzo unitario (HAR.md voce #12)
    expect(result.prezzoLordo).toBe("10.00000000");
    // scontoLordo = sconto DELLA RIGA, passato tale e quale = 4.00
    expect(result.scontoLordo).toBe("4.00000000");
    // scontoUnitario = scontoLordo / 1.22 (netto IVA, NON "per unita")
    expect(result.scontoUnitario).toBe("3.27868852");
    // imponibile = 20 / 1.22, imponibileNetto = imponibile - scontoUnitario
    expect(result.imponibile).toBe("16.39344262");
    expect(result.imponibileNetto).toBe("13.11475410");
    // importoIVA = imponibileNetto * 22 / 100
    expect(result.importoIVA).toBe("2.88524590");
    expect(result.totale).toBe("16.00000000");
  });

  it("marks gift line correctly", () => {
    const line: SaleLineRequest = {
      description: "Omaggio",
      quantity: 1,
      unitPriceGross: 5,
      lineDiscount: 0,
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
      lineDiscount: 0,
      vatCode: "N1",
      isGift: false,
    };

    const result = computeLineAmounts(line);
    expect(result.idElementoContabile).toBe("");
    expect(result.resiPregressi).toBe("0.00");
    expect(result.reso).toBe("0.00");
  });

  it("arrotonda il lordo di riga al centesimo su quantità frazionaria (REVIEW.md #57)", () => {
    // 0,5 × €0,99 = 0,495 → arrotondato a 0,50 (per-riga in cents), NON
    // trasmesso come "0.49500000". Il vecchio mapper teneva il mezzo cent,
    // divergendo dal payment (round(price*qty*100) = 50 cents).
    const line: SaleLineRequest = {
      description: "Prosciutto (0,5 kg)",
      quantity: 0.5,
      unitPriceGross: 0.99,
      lineDiscount: 0,
      vatCode: "N2",
      isGift: false,
    };

    const result = computeLineAmounts(line);
    // prezzoLordo resta il prezzo unitario (HAR.md voce #12); il cent-esatto
    // vive su `totale`, che e' il valore che riconcilia col payment.
    expect(result.prezzoLordo).toBe("0.99000000");
    expect(result.totale).toBe("0.50000000");
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
// buildCedenteFromBusiness
// ---------------------------------------------------------------------------

describe("buildCedenteFromBusiness", () => {
  const FULL_BUSINESS: BusinessCedenteData = {
    vatNumber: "12345678901",
    fiscalCode: "RSSMRA80A01H501A",
    businessName: "Test SRL",
    address: "VIA ROMA",
    streetNumber: "1",
    city: "ROMA",
    province: "RM",
    zipCode: "00100",
    preferredVatCode: "22",
  };

  it("maps all business fields to AdeCedentePrestatore", () => {
    const result = buildCedenteFromBusiness(FULL_BUSINESS);

    expect(result.identificativiFiscali.codicePaese).toBe("IT");
    expect(result.identificativiFiscali.partitaIva).toBe("12345678901");
    expect(result.identificativiFiscali.codiceFiscale).toBe("RSSMRA80A01H501A");

    const altri = result.altriDatiIdentificativi;
    expect(altri.denominazione).toBe("Test SRL");
    expect(altri.nome).toBe("");
    expect(altri.cognome).toBe("");
    expect(altri.indirizzo).toBe("VIA ROMA");
    expect(altri.numeroCivico).toBe("1");
    expect(altri.cap).toBe("00100");
    expect(altri.comune).toBe("ROMA");
    expect(altri.provincia).toBe("RM");
    expect(altri.nazione).toBe("IT");
    expect(altri.defAliquotaIVA).toBe("22");
    expect(altri.nuovoUtente).toBe(false);

    expect(result.multiAttivita).toEqual([]);
    expect(result.multiSede).toEqual([]);
  });

  it("sets modificati: true to signal local data override", () => {
    const result = buildCedenteFromBusiness(FULL_BUSINESS);
    expect(result.altriDatiIdentificativi.modificati).toBe(true);
  });

  it("uses empty strings for null fields", () => {
    const sparse: BusinessCedenteData = {
      vatNumber: null,
      fiscalCode: null,
      businessName: null,
      address: null,
      streetNumber: null,
      city: null,
      province: null,
      zipCode: null,
      preferredVatCode: null,
    };
    const result = buildCedenteFromBusiness(sparse);

    expect(result.identificativiFiscali.partitaIva).toBe("");
    expect(result.identificativiFiscali.codiceFiscale).toBe("");
    expect(result.altriDatiIdentificativi.denominazione).toBe("");
    expect(result.altriDatiIdentificativi.indirizzo).toBe("");
    expect(result.altriDatiIdentificativi.defAliquotaIVA).toBe("");
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
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Cappuccino",
          quantity: 2,
          unitPriceGross: 1.5,
          lineDiscount: 0,
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
    expect(result.flagIdentificativiModificati).toBe(true);
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

  it("includes lottery code in cfCessionarioCommittente when provided", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      lotteryCode: "YYWLR30G",
      isGiftDocument: false,
      lines: [
        {
          description: "Test",
          quantity: 1,
          unitPriceGross: 10,
          lineDiscount: 0,
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
      "YYWLR30G",
    );
  });

  it("uses empty string for cfCessionarioCommittente when lotteryCode is null", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Test",
          quantity: 1,
          unitPriceGross: 5,
          lineDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
      ],
      payments: [{ type: "CASH", amount: 5 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const result = mapSaleToAdePayload(doc, mockCedentePrestatore);
    expect(result.documentoCommerciale.cfCessionarioCommittente).toBe("");
  });

  it("maps multiple payment types including meal voucher with count", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Pranzo",
          quantity: 1,
          unitPriceGross: 15,
          lineDiscount: 0,
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
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Test",
          quantity: 1,
          unitPriceGross: 5,
          lineDiscount: 0,
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
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Prodotto A",
          quantity: 1,
          unitPriceGross: 10,
          lineDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
        {
          description: "Prodotto B",
          quantity: 1,
          unitPriceGross: 5,
          lineDiscount: 0,
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

    // Document totals use 8 decimal places (HAR finding: vendita.har)
    expect(dc.ammontareComplessivo).toBe("15.00000000");
    expect(dc.totaleImponibile).toBe("15.00000000");
    expect(dc.importoTotaleIva).toBe("0.00000000");
    expect(dc.scontoTotale).toBe("0.00000000");
    expect(dc.totaleNonRiscosso).toBe("0.00000000");
  });

  it("riconcilia ammontareComplessivo col payment su quantità frazionarie (REVIEW.md #57)", () => {
    // Caso canonico del finding: 2 righe da 0,5 × €0,99. Il vecchio mapper
    // sommava i lordi float (0,495 × 2 = 0,99) divergendo di 1 cent dal payment
    // (1,00). La somma per-riga in cents dà 0,50 × 2 = 1,00.
    const doc: SaleDocumentRequest = {
      date: "2026-02-15",
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "A",
          quantity: 0.5,
          unitPriceGross: 0.99,
          lineDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
        {
          description: "B",
          quantity: 0.5,
          unitPriceGross: 0.99,
          lineDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
      ],
      payments: [{ type: "CASH", amount: 1 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const dc = mapSaleToAdePayload(
      doc,
      mockCedentePrestatore,
    ).documentoCommerciale;
    expect(dc.ammontareComplessivo).toBe("1.00000000");

    // Proprietà: sum(vendita[].importo) === ammontareComplessivo (al cent).
    const venditaCents = dc.vendita!.reduce(
      (s, v) => s + Math.round(Number.parseFloat(v.importo) * 100),
      0,
    );
    expect(venditaCents).toBe(
      Math.round(Number.parseFloat(dc.ammontareComplessivo) * 100),
    );
    expect(venditaCents).toBe(100);
  });

  it("ammontareComplessivo cent-esatto su una tabella di quantità frazionarie (REVIEW.md #57)", () => {
    const cases = [
      { quantity: 0.5, unitPriceGross: 0.99 }, // 0.495 → 50
      { quantity: 0.333, unitPriceGross: 3.0 }, // 0.999 → 100
      { quantity: 1.25, unitPriceGross: 2.49 }, // 3.1125 → 311
      { quantity: 0.125, unitPriceGross: 8.0 }, // 1.0 → 100
      { quantity: 2.75, unitPriceGross: 1.19 }, // 3.2725 → 327
    ];

    for (const c of cases) {
      const totalCents = Math.round(c.quantity * c.unitPriceGross * 100);
      const doc: SaleDocumentRequest = {
        date: "2026-02-15",
        lotteryCode: null,
        isGiftDocument: false,
        lines: [
          {
            description: "X",
            quantity: c.quantity,
            unitPriceGross: c.unitPriceGross,
            lineDiscount: 0,
            vatCode: "N2",
            isGift: false,
          },
        ],
        payments: [{ type: "CASH", amount: totalCents / 100 }],
        globalDiscount: 0,
        deductibleAmount: 0,
      };

      const dc = mapSaleToAdePayload(
        doc,
        mockCedentePrestatore,
      ).documentoCommerciale;
      const ammCents = Math.round(
        Number.parseFloat(dc.ammontareComplessivo) * 100,
      );
      expect(ammCents).toBe(totalCents);
    }
  });
});

// ---------------------------------------------------------------------------
// mapVoidToAdePayload
// ---------------------------------------------------------------------------

/**
 * Documento originale di esempio (GET /documenti/{idtrx}/).
 *
 * Riproduce la struttura reale dal HAR (annullo.har [04]):
 * - i campi monetari sono sotto documentoCommerciale (non a livello radice)
 * - idElementoContabile reali (non vuoti)
 * - totali monetari con precisione variabile (come da GET, non 8d fissi)
 * - resiPregressi assente negli elementi (aggiunto dal mapper come "0.00")
 * - cfCessionarioCommittente del cliente originale
 * - dataOra già in formato DD/MM/YYYY
 */
const mockOriginalDoc: AdeDocumentDetail = {
  idtrx: "151085589",
  documentoCommerciale: {
    cfCessionarioCommittente: "RSSMRA80A01H501A",
    flagDocCommPerRegalo: false,
    progressivoCollegato: "",
    dataOra: "15/02/2026",
    multiAttivita: { codiceAttivita: "", descAttivita: "" },
    importoTotaleIva: "2.2",
    scontoTotale: "0",
    scontoTotaleLordo: "0",
    totaleImponibile: "10",
    ammontareComplessivo: "12.2",
    totaleNonRiscosso: "0",
    scontoAbbuono: "0",
    importoDetraibileDeducibile: "0",
    elementiContabili: [
      {
        idElementoContabile: "270270040",
        reso: "0.00",
        quantita: "1.00",
        descrizioneProdotto: "Prodotto",
        prezzoLordo: "12.2",
        prezzoUnitario: "10",
        scontoUnitario: "0",
        scontoLordo: "0",
        aliquotaIVA: "22",
        importoIVA: "2.2",
        imponibile: "10",
        imponibileNetto: "10",
        totale: "12.2",
        omaggio: "N",
      },
    ],
  },
};

describe("mapVoidToAdePayload", () => {
  it("maps a void request to AdE annullo payload using original document data", () => {
    const voidReq: VoidRequest = {
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      originalDocument: {
        transactionId: "151085589",
        documentProgressive: "DCW2026/5111-2188",
        date: "2026-02-15",
      },
    };

    const result = mapVoidToAdePayload(
      voidReq,
      mockCedentePrestatore,
      mockOriginalDoc,
    );

    expect(result.idtrx).toBe("151085589");
    expect(result.datiTrasmissione.formato).toBe("DCW10");
    expect(result.flagIdentificativiModificati).toBe(true);

    // HAR fix (annullo.har [06]): cedentePrestatore modificato con
    // nuovoUtente=true e defAliquotaIVA="" per gli annulli
    expect(result.cedentePrestatore.altriDatiIdentificativi.nuovoUtente).toBe(
      true,
    );
    expect(
      result.cedentePrestatore.altriDatiIdentificativi.defAliquotaIVA,
    ).toBe("");
    // Gli altri campi del cedente sono preservati
    expect(result.cedentePrestatore.identificativiFiscali).toBe(
      mockCedentePrestatore.identificativiFiscali,
    );

    const dc = result.documentoCommerciale;

    // Dati identificativi dal documento originale
    expect(dc.cfCessionarioCommittente).toBe("RSSMRA80A01H501A");
    expect(dc.flagDocCommPerRegalo).toBe(false);
    expect(dc.dataOra).toBe("15/02/2026");

    // Totali monetari dal documento originale (8d)
    expect(dc.totaleImponibile).toBe("10.00000000");
    expect(dc.importoTotaleIva).toBe("2.20000000");
    expect(dc.ammontareComplessivo).toBe("12.20000000");
    expect(dc.scontoTotale).toBe("0.00000000");

    // elementiContabili completi con idElementoContabile reali
    expect(dc.elementiContabili).toHaveLength(1);
    expect(dc.elementiContabili[0].idElementoContabile).toBe("270270040");
    expect(dc.elementiContabili[0].descrizioneProdotto).toBe("Prodotto");

    // Dati annullo
    expect(dc.resoAnnullo).toBeDefined();
    expect(dc.resoAnnullo!.tipologia).toBe("A");
    expect(dc.resoAnnullo!.dataOra).toBe("15/02/2026");
    expect(dc.resoAnnullo!.progressivo).toBe("DCW2026/5111-2188");
    expect(dc.numeroProgressivo).toBe("DCW2026/5111-2188");

    // Annullo non ha vendita (pagamenti)
    expect(dc.vendita).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Oracoli HAR — payload verbatim accettati dall'AdE (REVIEW.md #88)
//
// I due documenti sono catture reali del portale AdE, entrambe con risposta
// `esito: true`: sono l'unica prova disponibile della semantica dei campi.
// Fonti e verifiche numeriche: HAR.md voci #1, #2, #4, #10, #12.
// ---------------------------------------------------------------------------

/** Somma i valori serializzati e li ri-serializza a 8 decimali. */
function sum8(...values: string[]): string {
  return toAdeAmount8(values.reduce((acc, v) => acc + Number.parseFloat(v), 0));
}

describe("computeLineAmounts — oracoli HAR", () => {
  it("riproduce i 15 campi della riga scontata di HAR.md voce #1 (qta 1, IVA 10%)", () => {
    // Portale: 1,00 € lordo, IVA 10%, sconto di riga 0,10 €, quantita 1.
    const line: SaleLineRequest = {
      description: "Prova con sconto",
      quantity: 1,
      unitPriceGross: 1.0,
      lineDiscount: 0.1,
      vatCode: "10",
      isGift: false,
    };

    expect(computeLineAmounts(line)).toEqual({
      idElementoContabile: "",
      resiPregressi: "0.00",
      reso: "0.00",
      quantita: "1.00",
      descrizioneProdotto: "Prova con sconto",
      prezzoLordo: "1.00000000",
      prezzoUnitario: "0.90909091",
      scontoUnitario: "0.09090909",
      scontoLordo: "0.10000000",
      aliquotaIVA: "10",
      importoIVA: "0.08181818",
      imponibile: "0.90909091",
      imponibileNetto: "0.81818182",
      totale: "0.90000000",
      omaggio: "N",
    });
  });

  it("riproduce i 15 campi della riga esente di HAR.md voce #1 (natura N2)", () => {
    // Sulle nature d = 1: la formula generale degenera senza rami speciali.
    const line: SaleLineRequest = {
      description: "Prova senza sconto",
      quantity: 1,
      unitPriceGross: 1.0,
      lineDiscount: 0,
      vatCode: "N2",
      isGift: false,
    };

    expect(computeLineAmounts(line)).toEqual({
      idElementoContabile: "",
      resiPregressi: "0.00",
      reso: "0.00",
      quantita: "1.00",
      descrizioneProdotto: "Prova senza sconto",
      prezzoLordo: "1.00000000",
      prezzoUnitario: "1.00000000",
      scontoUnitario: "0.00000000",
      scontoLordo: "0.00000000",
      aliquotaIVA: "N2",
      importoIVA: "0.00000000",
      imponibile: "1.00000000",
      imponibileNetto: "1.00000000",
      totale: "1.00000000",
      omaggio: "N",
    });
  });

  it("riproduce i 15 campi di HAR.md voce #12 (qta 2, IVA 22%, sconto di riga 1,00)", () => {
    // Il caso che disambigua: prezzoLordo vale 3,00 (unitario) e NON 6,00,
    // scontoUnitario vale 0.81967213 (= 1,00 / 1,22) e NON 1.63934426.
    // Nel nostro DTO lo sconto e' gia' DI RIGA: 1,00, come lo manda il
    // portale. Nessuna moltiplicazione per la quantita'.
    const line: SaleLineRequest = {
      description: "doppio",
      quantity: 2,
      unitPriceGross: 3.0,
      lineDiscount: 1.0,
      vatCode: "22",
      isGift: false,
    };

    expect(computeLineAmounts(line)).toEqual({
      idElementoContabile: "",
      resiPregressi: "0.00",
      reso: "0.00",
      quantita: "2.00",
      descrizioneProdotto: "doppio",
      prezzoLordo: "3.00000000",
      prezzoUnitario: "2.45901639",
      scontoUnitario: "0.81967213",
      scontoLordo: "1.00000000",
      aliquotaIVA: "22",
      importoIVA: "0.90163934",
      imponibile: "4.91803279",
      imponibileNetto: "4.09836066",
      totale: "5.00000000",
      omaggio: "N",
    });
  });

  it("tiene l'invariante di riga anche su quantita frazionaria con aliquota IVA", () => {
    // Edge del cent-esatto (regola 17): 0,333 kg x 3,00 = 0,999 -> lordo 1,00.
    // I netti derivano dal lordo cent-esatto, quindi l'invariante regge; se
    // `imponibile` fosse prezzoUnitario x quantita divergerebbe di ~0,001.
    const el = computeLineAmounts({
      description: "Sfuso (0,333 kg)",
      quantity: 0.333,
      unitPriceGross: 3.0,
      lineDiscount: 0,
      vatCode: "22",
      isGift: false,
    });

    expect(el.totale).toBe("1.00000000");
    expect(sum8(el.imponibileNetto, el.importoIVA)).toBe(el.totale);
  });

  it("azzera la riga quando lo sconto copre l'intero prezzo", () => {
    const el = computeLineAmounts({
      description: "Tutto scontato",
      quantity: 2,
      unitPriceGross: 4.5,
      lineDiscount: 9.0,
      vatCode: "22",
      isGift: false,
    });

    expect(el.totale).toBe("0.00000000");
    expect(el.imponibileNetto).toBe("0.00000000");
    expect(el.importoIVA).toBe("0.00000000");
    // prezzoLordo e scontoLordo restano dichiarati, solo il netto e' zero.
    expect(el.prezzoLordo).toBe("4.50000000");
    expect(el.scontoLordo).toBe("9.00000000");
  });

  it("mantiene l'invariante di riga imponibileNetto + importoIVA === totale", () => {
    for (const vatCode of ["4", "5", "10", "22", "N2"]) {
      for (const lineDiscount of [0, 0.1, 0.5, 1.37]) {
        for (const quantity of [1, 2, 7]) {
          const el = computeLineAmounts({
            description: "X",
            quantity,
            unitPriceGross: 3.99,
            lineDiscount,
            vatCode,
            isGift: false,
          });

          expect(sum8(el.imponibileNetto, el.importoIVA)).toBe(el.totale);
        }
      }
    }
  });
});

describe("mapSaleToAdePayload — oracoli HAR", () => {
  /** Documento completo di HAR.md voce #1 (accettato: idtrx 226076907). */
  const docVoce1: SaleDocumentRequest = {
    date: "2026-08-18",
    lotteryCode: null,
    isGiftDocument: false,
    lines: [
      {
        description: "Prova senza sconto",
        quantity: 1,
        unitPriceGross: 1.0,
        lineDiscount: 0,
        vatCode: "N2",
        isGift: false,
      },
      {
        description: "Prova con sconto",
        quantity: 1,
        unitPriceGross: 1.0,
        lineDiscount: 0.1,
        vatCode: "10",
        isGift: false,
      },
    ],
    payments: [
      { type: "CASH", amount: 0.5 },
      { type: "ELECTRONIC", amount: 1.0 },
    ],
    globalDiscount: 0.4,
    deductibleAmount: 0,
  };

  it("riproduce i totali di documento di HAR.md voce #1", () => {
    const dc = mapSaleToAdePayload(
      docVoce1,
      mockCedentePrestatore,
    ).documentoCommerciale;

    expect(dc.totaleImponibile).toBe("1.90909091");
    expect(dc.importoTotaleIva).toBe("0.08181818");
    expect(dc.ammontareComplessivo).toBe("1.90000000");
    expect(dc.totaleNonRiscosso).toBe("0.00000000");
    expect(dc.scontoAbbuono).toBe("0.40");
  });

  it("distingue scontoTotale (netto IVA) da scontoTotaleLordo", () => {
    // Il portale rende i due campi come "Sconto totale al netto dell'IVA" e
    // sconto lordo: coincidono solo se ogni riga scontata e' a natura N*.
    const dc = mapSaleToAdePayload(
      docVoce1,
      mockCedentePrestatore,
    ).documentoCommerciale;

    expect(dc.scontoTotale).toBe("0.09090909");
    expect(dc.scontoTotaleLordo).toBe("0.10000000");
    expect(dc.scontoTotale).not.toBe(dc.scontoTotaleLordo);
  });

  it("quadra la voce #5: sum(vendita[].importo) + scontoAbbuono === ammontareComplessivo", () => {
    const dc = mapSaleToAdePayload(
      docVoce1,
      mockCedentePrestatore,
    ).documentoCommerciale;

    const paidCents = dc.vendita!.reduce(
      (s, v) => s + Math.round(Number.parseFloat(v.importo) * 100),
      0,
    );
    const abbuonoCents = Math.round(Number.parseFloat(dc.scontoAbbuono) * 100);
    expect(paidCents + abbuonoCents).toBe(
      Math.round(Number.parseFloat(dc.ammontareComplessivo) * 100),
    );
  });

  it("mantiene l'invariante di documento della voce #4", () => {
    const dc = mapSaleToAdePayload(
      docVoce1,
      mockCedentePrestatore,
    ).documentoCommerciale;

    // totaleImponibile - scontoTotale + importoTotaleIva === ammontareComplessivo
    const left = toAdeAmount8(
      Number.parseFloat(dc.totaleImponibile) -
        Number.parseFloat(dc.scontoTotale) +
        Number.parseFloat(dc.importoTotaleIva),
    );
    expect(left).toBe(dc.ammontareComplessivo);
  });

  it("azzera ammontareComplessivo su un documento di soli omaggi", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-08-18",
      lotteryCode: null,
      isGiftDocument: true,
      lines: [
        {
          description: "Omaggio",
          quantity: 1,
          unitPriceGross: 5,
          lineDiscount: 0,
          vatCode: "22",
          isGift: true,
        },
      ],
      payments: [{ type: "CASH", amount: 0 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const dc = mapSaleToAdePayload(
      doc,
      mockCedentePrestatore,
    ).documentoCommerciale;

    expect(dc.ammontareComplessivo).toBe("0.00000000");
    expect(dc.totaleImponibile).toBe("4.09836066");
  });

  it("esclude le righe omaggio da ammontareComplessivo ma non dagli imponibili (HAR.md voce #7)", () => {
    const doc: SaleDocumentRequest = {
      date: "2026-08-18",
      lotteryCode: null,
      isGiftDocument: false,
      lines: [
        {
          description: "Venduto",
          quantity: 1,
          unitPriceGross: 1.7,
          lineDiscount: 0,
          vatCode: "N2",
          isGift: false,
        },
        {
          description: "Omaggio",
          quantity: 2,
          unitPriceGross: 1.0,
          lineDiscount: 0,
          vatCode: "N2",
          isGift: true,
        },
      ],
      payments: [{ type: "CASH", amount: 1.7 }],
      globalDiscount: 0,
      deductibleAmount: 0,
    };

    const dc = mapSaleToAdePayload(
      doc,
      mockCedentePrestatore,
    ).documentoCommerciale;

    // L'omaggio concorre all'imponibile ma non all'importo dovuto dal cliente.
    expect(dc.totaleImponibile).toBe("3.70000000");
    expect(dc.ammontareComplessivo).toBe("1.70000000");
  });
});
