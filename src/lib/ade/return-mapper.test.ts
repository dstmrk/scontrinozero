import { describe, expect, it } from "vitest";

import {
  serie1DopoResi,
  serie1Reso1,
  serie1Reso2,
  serie2Reso1,
  serie2Reso2,
  type ResoHarCase,
} from "../../../tests/_helpers/reso-har-fixtures";
import {
  getReturnableQuantities,
  getReturnedQuantities,
  hasAnyReturn,
  mapReturnToAdePayload,
  validateReturnQuantities,
} from "./return-mapper";
import type { AdeCedentePrestatore, AdeDocumentDetail } from "./types";

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
});

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
