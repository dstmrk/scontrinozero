import { describe, expect, it } from "vitest";

import {
  serie1DopoResi,
  serie1Reso1,
  serie1Reso2,
  serie2Reso1,
  serie2Reso2,
  type ResoHarCase,
} from "../../../tests/_helpers/reso-har-fixtures";
import { computeLineAmounts } from "./mapper";
import {
  getReturnableQuantities,
  getReturnedQuantities,
  hasAnyReturn,
  isReturnComputable,
  mapReturnToAdePayload,
  validateReturnQuantities,
} from "./return-mapper";
import type {
  AdeCedentePrestatore,
  AdeDocumentDetail,
  AdeDocumentDetailElemento,
} from "./types";

const cedente: AdeCedentePrestatore = {
  identificativiFiscali: {
    codicePaese: "IT",
    partitaIva: "12345678901",
    codiceFiscale: "RSSMRA80A01H501A",
  },
  altriDatiIdentificativi: {
    denominazione: "Test",
    nome: "",
    cognome: "",
    indirizzo: "Corso S",
    numeroCivico: "22",
    cap: "10126",
    comune: "",
    provincia: "",
    nazione: "IT",
    modificati: true,
    defAliquotaIVA: "22",
    nuovoUtente: false,
  },
  multiAttivita: [],
  multiSede: [],
};

function mapCase(c: ResoHarCase) {
  return mapReturnToAdePayload({
    cedentePrestatore: cedente,
    originalDoc: c.before,
    originalProgressive: c.posted.documentoCommerciale.numeroProgressivo!,
    quantities: c.quantities,
  });
}

describe("mapReturnToAdePayload — oracoli HAR.md #19", () => {
  it.each([
    ["serie 1, reso 1 (1 di 2 scontato + 1 di 1 N2)", serie1Reso1],
    ["serie 1, reso 2 (l'ultimo pezzo scontato)", serie1Reso2],
    ["serie 2, reso 1 di 3 (riproporzione in terzi)", serie2Reso1],
    ["serie 2, reso 2 di 3 (proporzione, non residuo)", serie2Reso2],
  ])(
    "riproduce il documentoCommerciale trasmesso dal portale: %s",
    (_label, c) => {
      const payload = mapCase(c);
      expect(payload.documentoCommerciale).toEqual(
        c.posted.documentoCommerciale,
      );
      expect(payload.idtrx).toBe(c.posted.idtrx);
    },
  );

  it("rimanda il cedente come l'annullo: nuovoUtente true, defAliquotaIVA vuota", () => {
    const payload = mapCase(serie1Reso1);
    expect(payload.cedentePrestatore.altriDatiIdentificativi).toMatchObject({
      nuovoUtente: true,
      defAliquotaIVA: "",
      denominazione: "Test",
    });
    expect(payload.cedentePrestatore.identificativiFiscali).toEqual(
      cedente.identificativiFiscali,
    );
    expect(payload.datiTrasmissione).toEqual({ formato: "DCW10" });
    expect(payload.flagIdentificativiModificati).toBe(true);
  });

  it("non manda pagamenti: un reso non incassa", () => {
    expect(mapCase(serie2Reso1).documentoCommerciale.vendita).toBeUndefined();
  });

  it("tiene fuori le righe omaggio da ammontareComplessivo (voce #7)", () => {
    const withGift: AdeDocumentDetail = {
      idtrx: "1",
      documentoCommerciale: {
        ...serie1Reso1.before.documentoCommerciale,
        elementiContabili:
          serie1Reso1.before.documentoCommerciale.elementiContabili.map(
            (el, i) => (i === 1 ? { ...el, omaggio: "Y" as const } : el),
          ),
      },
    };
    const payload = mapReturnToAdePayload({
      cedentePrestatore: cedente,
      originalDoc: withGift,
      originalProgressive: "DCW2026/1-1",
      quantities: [1, 1],
    });
    // Solo la riga "doppio" (0,025): la riga omaggio da 0,02 non si storna.
    expect(payload.documentoCommerciale.ammontareComplessivo).toBe(
      "0.02500000",
    );
    expect(payload.documentoCommerciale.elementiContabili[1]!.totale).toBe(
      "0.02000000",
    );
  });

  it("una riga venduta a quantità zero e non resa resta tutta a zero, mai NaN", () => {
    const base = serie1Reso1.before.documentoCommerciale;
    const doc: AdeDocumentDetail = {
      idtrx: "1",
      documentoCommerciale: {
        ...base,
        elementiContabili: [
          base.elementiContabili[0]!,
          { ...base.elementiContabili[1]!, quantita: "0" },
        ],
      },
    };
    const line = mapReturnToAdePayload({
      cedentePrestatore: cedente,
      originalDoc: doc,
      originalProgressive: "DCW2026/1-1",
      quantities: [1, 0],
    }).documentoCommerciale.elementiContabili[1]!;

    expect(line).toMatchObject({
      reso: "0.00",
      scontoUnitario: "0.00000000",
      totale: "0.00000000",
    });
  });

  it("rifiuta quantità non valide invece di trasmetterle", () => {
    expect(() =>
      mapReturnToAdePayload({
        cedentePrestatore: cedente,
        originalDoc: serie1DopoResi,
        originalProgressive: "DCW2026/4801-7890",
        quantities: [1, 0],
      }),
    ).toThrow(/reso/i);
  });
});

describe("getReturnedQuantities / getReturnableQuantities", () => {
  it("legge il cumulativo di riga prima di ogni reso", () => {
    expect(getReturnedQuantities(serie1Reso1.before)).toEqual([0, 0]);
    expect(getReturnableQuantities(serie1Reso1.before)).toEqual([2, 1]);
  });

  it("dopo un reso, il residuo è venduto meno già reso", () => {
    expect(getReturnedQuantities(serie1Reso2.before)).toEqual([1, 1]);
    expect(getReturnableQuantities(serie1Reso2.before)).toEqual([1, 0]);
    expect(getReturnableQuantities(serie2Reso2.before)).toEqual([2]);
  });

  it("una vendita resa per intero non ha più nulla da rendere", () => {
    expect(getReturnableQuantities(serie1DopoResi)).toEqual([0, 0]);
  });

  it("non perde centesimi sulle quantità frazionarie", () => {
    const doc = withLine({ quantita: "1.3", reso: "0.1" });
    expect(getReturnableQuantities(doc)).toEqual([1.2]);
  });
});

describe("hasAnyReturn", () => {
  it("è falso su una vendita mai resa", () => {
    expect(hasAnyReturn(serie1Reso1.before)).toBe(false);
  });

  it("è vero appena una riga ha un reso", () => {
    expect(hasAnyReturn(serie1Reso2.before)).toBe(true);
    expect(hasAnyReturn(serie1DopoResi)).toBe(true);
  });

  it("è vero se il cumulativo non si legge: blocca l'annullo, non lo lascia passare", () => {
    expect(hasAnyReturn(withLine({ quantita: "3", reso: "" }))).toBe(true);
    expect(
      hasAnyReturn(
        withLine({ quantita: "3", reso: undefined as unknown as string }),
      ),
    ).toBe(true);
  });
});

describe("isReturnComputable — le formule del portale reggono sulla riga?", () => {
  it.each([
    ["serie 1, reso 1", serie1Reso1],
    ["serie 1, reso 2", serie1Reso2],
    ["serie 2, reso 1", serie2Reso1],
    ["serie 2, reso 2", serie2Reso2],
  ])("sì sugli oracoli HAR: %s", (_label, c) => {
    expect(isReturnComputable(c.before, c.quantities)).toBe(true);
  });

  it.each([
    ["quantità intera con sconto di riga", 2, 3, 1, "22"],
    ["quantità frazionaria a due decimali", 0.25, 3.99, 0, "10"],
    ["natura, più pezzi", 4, 2.5, 0, "N2"],
    ["tre decimali che arrotondano innocui", 0.125, 1, 0, "22"],
  ])(
    "sì su una riga del mapper attuale: %s",
    (_label, quantity, unitPriceGross, lineDiscount, vatCode) => {
      const doc = docOf(
        currentLine({ quantity, unitPriceGross, lineDiscount, vatCode }),
      );
      const all = Number(
        doc.documentoCommerciale.elementiContabili[0]!.quantita,
      );
      expect(isReturnComputable(doc, [all])).toBe(true);
    },
  );

  it("no su una vendita API a tre decimali che l'AdE ha ricevuto arrotondata", () => {
    // 0,125 kg a 10 €/kg: venduto 1,25 €, ma l'AdE ha `quantita` 0,13 e
    // `prezzoUnitario × 0,13` storna 1,30 €.
    const doc = docOf(
      currentLine({
        quantity: 0.125,
        unitPriceGross: 10,
        lineDiscount: 0,
        vatCode: "22",
      }),
    );
    expect(isReturnComputable(doc, [0.13])).toBe(false);
  });

  it("no su una riga da più pezzi emessa fino alla v1.7.0 (prezzoUnitario di riga)", () => {
    // Mapper ≤ v1.7.0 (HAR.md #11): 2 × 3,00 € al 22% → prezzoLordo e
    // prezzoUnitario di RIGA. Il reso di 1 pezzo stornerebbe 6,00 €.
    const doc = docOf(
      legacyLine({ quantita: "2", prezzoUnitario: "4.92", imponibile: "4.92" }),
    );
    expect(isReturnComputable(doc, [1])).toBe(false);
  });

  it("sì su una riga da un pezzo senza sconto della v1.7.0: le formule coincidono", () => {
    const doc = docOf(
      legacyLine({ quantita: "1", prezzoUnitario: "2.46", imponibile: "2.46" }),
    );
    expect(isReturnComputable(doc, [1])).toBe(true);
  });

  it("no su uno sconto di riga della v1.7.0 (scontoUnitario lordo per pezzo)", () => {
    // 1 × 5,00 € con sconto 1,00 € al 22%: imponibileNetto 3,28, ma
    // imponibile − scontoUnitario fa 3,10.
    const doc = docOf(
      legacyLine({
        quantita: "1",
        prezzoUnitario: "4.10",
        imponibile: "4.10",
        scontoUnitario: "1.00",
        imponibileNetto: "3.28",
      }),
    );
    expect(isReturnComputable(doc, [1])).toBe(false);
  });

  it("guarda solo le righe rese adesso", () => {
    const doc = docOf(
      legacyLine({ quantita: "2", prezzoUnitario: "4.92", imponibile: "4.92" }),
      legacyLine({ quantita: "1", prezzoUnitario: "2.46", imponibile: "2.46" }),
    );
    expect(isReturnComputable(doc, [0, 1])).toBe(true);
    expect(isReturnComputable(doc, [1, 0])).toBe(false);
  });

  it("no su importi illeggibili", () => {
    const doc = docOf(
      legacyLine({ quantita: "1", prezzoUnitario: "", imponibile: "2.46" }),
    );
    expect(isReturnComputable(doc, [1])).toBe(false);
  });

  it("il mapper si rifiuta di costruire il payload", () => {
    const doc = docOf(
      legacyLine({ quantita: "2", prezzoUnitario: "4.92", imponibile: "4.92" }),
    );
    expect(() =>
      mapReturnToAdePayload({
        cedentePrestatore: cedente,
        originalDoc: doc,
        originalProgressive: "DCW2026/1-1",
        quantities: [1],
      }),
    ).toThrow(/reso/i);
  });
});

describe("validateReturnQuantities", () => {
  const doc = serie1Reso1.before;

  it("accetta un reso parziale entro il residuo", () => {
    expect(validateReturnQuantities(doc, [1, 0])).toBeNull();
    expect(validateReturnQuantities(doc, [2, 1])).toBeNull();
  });

  it("rifiuta un numero di righe diverso dal documento", () => {
    expect(validateReturnQuantities(doc, [1])).toBe("LINE_COUNT_MISMATCH");
  });

  it("rifiuta un reso vuoto", () => {
    expect(validateReturnQuantities(doc, [0, 0])).toBe("NOTHING_TO_RETURN");
  });

  it("rifiuta quantità negative o non finite", () => {
    expect(validateReturnQuantities(doc, [-1, 1])).toBe("INVALID_QUANTITY");
    expect(validateReturnQuantities(doc, [Number.NaN, 1])).toBe(
      "INVALID_QUANTITY",
    );
  });

  it("rifiuta più di due decimali (il portale ne accetta due)", () => {
    expect(validateReturnQuantities(doc, [0.005, 0])).toBe("INVALID_QUANTITY");
  });

  it("rifiuta oltre il residuo, contando i resi precedenti", () => {
    expect(validateReturnQuantities(doc, [3, 0])).toBe("EXCEEDS_RETURNABLE");
    expect(validateReturnQuantities(serie1Reso2.before, [1, 1])).toBe(
      "EXCEEDS_RETURNABLE",
    );
  });

  it("rifiuta se il residuo non si legge, invece di dare via libera", () => {
    expect(
      validateReturnQuantities(withLine({ quantita: "3", reso: "x" }), [1]),
    ).toBe("EXCEEDS_RETURNABLE");
    expect(
      validateReturnQuantities(withLine({ quantita: "", reso: "0" }), [1]),
    ).toBe("EXCEEDS_RETURNABLE");
  });
});

/** Riga del dettaglio GET come la produce il mapper di vendita attuale. */
function currentLine(line: {
  quantity: number;
  unitPriceGross: number;
  lineDiscount: number;
  vatCode: string;
}): AdeDocumentDetailElemento {
  const { resiPregressi: _resiPregressi, ...el } = computeLineAmounts({
    ...line,
    description: "riga",
    isGift: false,
  });
  return { ...el, idElementoContabile: "1", reso: "0" };
}

/** Riga del mapper ≤ v1.7.0: importi al centesimo, prezzi di riga. */
function legacyLine(
  over: Partial<AdeDocumentDetailElemento>,
): AdeDocumentDetailElemento {
  return {
    idElementoContabile: "1",
    reso: "0",
    quantita: "1",
    descrizioneProdotto: "riga",
    prezzoLordo: "3.00",
    prezzoUnitario: "2.46",
    scontoUnitario: "0",
    scontoLordo: "0",
    aliquotaIVA: "22",
    importoIVA: "0.54",
    imponibile: "2.46",
    imponibileNetto: over.imponibile ?? "2.46",
    totale: "3.00",
    omaggio: "N",
    ...over,
  };
}

function docOf(...lines: AdeDocumentDetailElemento[]): AdeDocumentDetail {
  return {
    idtrx: "1",
    documentoCommerciale: {
      ...serie2Reso1.before.documentoCommerciale,
      elementiContabili: lines,
    },
  };
}

function withLine(over: { quantita: string; reso: string }): AdeDocumentDetail {
  const base = serie2Reso1.before;
  return {
    idtrx: base.idtrx,
    documentoCommerciale: {
      ...base.documentoCommerciale,
      elementiContabili: [
        { ...base.documentoCommerciale.elementiContabili[0]!, ...over },
      ],
    },
  };
}
