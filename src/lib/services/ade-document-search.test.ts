import { describe, expect, it, vi } from "vitest";
import {
  MAX_ADE_SEARCH_DOCUMENTS,
  buildAdeSearchRange,
  fetchAdeSaleRows,
  inclusiveDaySpan,
  toAdeQueryDay,
  toAdeReceiptListItem,
} from "./ade-document-search";
import { ADE_SEARCH_MAX_DAYS } from "@/types/storico";
import type { AdeDocumentSummary } from "@/lib/ade/types";

/** Vendita AdE minima; i test sovrascrivono solo il campo che stanno provando. */
function saleDoc(over: Partial<AdeDocumentSummary> = {}): AdeDocumentSummary {
  return {
    idtrx: "226076907",
    numeroProgressivo: "DCW2026/2610-5298",
    cfCliente: "",
    data: "18/08/2026 19:05:10",
    tipoOperazione: "V",
    ammontareComplessivo: 1.9,
    ...over,
  };
}

describe("toAdeQueryDay", () => {
  it("gira il giorno ISO nel MM/DD/YYYY dei query param AdE", () => {
    expect(toAdeQueryDay("2026-08-18")).toBe("08/18/2026");
  });

  it("non confonde giorno e mese quando sono entrambi validi", () => {
    // 2026-03-04 = 4 marzo. In MM/DD/YYYY è 03/04, non 04/03.
    expect(toAdeQueryDay("2026-03-04")).toBe("03/04/2026");
  });

  it("rifiuta un input che non è un giorno ISO", () => {
    expect(toAdeQueryDay("18/08/2026")).toBeNull();
  });
});

describe("inclusiveDaySpan", () => {
  it("conta un giorno solo quando gli estremi coincidono", () => {
    expect(inclusiveDaySpan("2026-08-18", "2026-08-18")).toBe(1);
  });

  it("conta gli estremi inclusi", () => {
    expect(inclusiveDaySpan("2026-08-01", "2026-08-31")).toBe(31);
  });

  it("il mese più lungo sta esattamente nel tetto", () => {
    expect(inclusiveDaySpan("2026-01-01", "2026-01-31")).toBe(
      ADE_SEARCH_MAX_DAYS,
    );
  });

  it("attraversa il cambio d'ora senza perdere o guadagnare un giorno", () => {
    // In Italia l'ora legale finisce il 25/10/2026: quella domenica dura 25h.
    // Il conteggio è di calendario, non di millisecondi, quindi non se ne
    // accorge.
    expect(inclusiveDaySpan("2026-10-24", "2026-10-26")).toBe(3);
  });

  it("è null su un estremo malformato", () => {
    expect(inclusiveDaySpan("2026-08", "2026-08-31")).toBeNull();
  });
});

describe("buildAdeSearchRange", () => {
  it("traduce un periodo valido nella finestra di query", () => {
    expect(buildAdeSearchRange("2026-08-01", "2026-08-31")).toEqual({
      dataDal: "08/01/2026",
      dataInvioAl: "08/31/2026",
    });
  });

  it("un periodo aperto viene rifiutato invece di scaricare l'archivio", () => {
    expect(buildAdeSearchRange(undefined, "2026-08-31")).toMatchObject({
      error: expect.stringContaining("periodo"),
    });
  });

  it("rifiuta un periodo oltre il tetto", () => {
    const result = buildAdeSearchRange("2026-08-01", "2026-09-05");
    expect(result).toMatchObject({
      error: expect.stringContaining(String(ADE_SEARCH_MAX_DAYS)),
    });
  });

  it("accetta esattamente il tetto", () => {
    expect(buildAdeSearchRange("2026-08-01", "2026-08-31")).not.toHaveProperty(
      "error",
    );
  });

  it("rifiuta gli estremi invertiti", () => {
    expect(buildAdeSearchRange("2026-08-31", "2026-08-01")).toMatchObject({
      error: expect.stringContaining("inizio"),
    });
  });

  it("rifiuta un estremo malformato", () => {
    expect(buildAdeSearchRange("31/08/2026", "2026-08-31")).toMatchObject({
      error: "Filtro data non valido.",
    });
  });
});

describe("toAdeReceiptListItem", () => {
  it("traduce una vendita in una riga emessa", () => {
    expect(toAdeReceiptListItem(saleDoc())).toEqual({
      origin: "ade",
      idtrx: "226076907",
      adeProgressive: "DCW2026/2610-5298",
      adeRegisteredAt: new Date("2026-08-18T17:05:10.000Z"),
      status: "ACCEPTED",
      total: "1.90",
    });
  });

  it('HAR.md #16c — su una vendita `annulli: "A"` è il flag di annullamento', () => {
    const row = toAdeReceiptListItem(saleDoc({ annulli: "A" }));
    expect(row?.status).toBe("VOID_ACCEPTED");
  });

  it("HAR.md #16c — il flag non finisce nel progressivo", () => {
    const row = toAdeReceiptListItem(saleDoc({ annulli: "A" }));
    expect(row?.adeProgressive).toBe("DCW2026/2610-5298");
  });

  it("scarta le righe che non sono vendite", () => {
    expect(
      toAdeReceiptListItem(
        saleDoc({ tipoOperazione: "A", annulli: "DCW2026/2610-5298" }),
      ),
    ).toBeNull();
  });

  it("scarta una riga con `data` illeggibile invece di collocarla a caso", () => {
    expect(toAdeReceiptListItem(saleDoc({ data: "18-08-2026" }))).toBeNull();
  });

  it("porta l'importo in centesimi interi, assorbendo l'artefatto float", () => {
    // `ammontareComplessivo` arriva come number JSON: 8.4 * 100 vale
    // 839.9999999999999 in IEEE 754, e un troncamento darebbe 8.39. È il
    // motivo per cui si arrotonda in cents invece di formattare il float.
    const row = toAdeReceiptListItem(saleDoc({ ammontareComplessivo: 8.4 }));
    expect(row?.total).toBe("8.40");
  });

  it("rende sempre due decimali", () => {
    const row = toAdeReceiptListItem(saleDoc({ ammontareComplessivo: 12 }));
    expect(row?.total).toBe("12.00");
  });
});

describe("fetchAdeSaleRows", () => {
  it("chiede le sole vendite nella finestra data", async () => {
    const searchDocuments = vi
      .fn()
      .mockResolvedValue({ totalCount: 1, elencoRisultati: [saleDoc()] });

    await fetchAdeSaleRows(
      { searchDocuments },
      { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
    );

    expect(searchDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        dataDal: "08/01/2026",
        dataInvioAl: "08/31/2026",
        tipoOperazione: "V",
        page: 1,
      }),
    );
  });

  it("impagina finché non ha coperto totalCount", async () => {
    const searchDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        totalCount: 3,
        elencoRisultati: [saleDoc({ idtrx: "1" }), saleDoc({ idtrx: "2" })],
      })
      .mockResolvedValueOnce({
        totalCount: 3,
        elencoRisultati: [saleDoc({ idtrx: "3" })],
      });

    const result = await fetchAdeSaleRows(
      { searchDocuments },
      { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
    );

    expect(result.rows.map((r) => r.idtrx)).toEqual(["1", "2", "3"]);
  });

  it("avanza sugli elementi ricevuti, non su quelli richiesti", async () => {
    // Il portale ricapa `perPage` a 2: il ciclo deve accorgersene da solo e
    // continuare, non fermarsi credendo di aver ricevuto una pagina piena.
    const searchDocuments = vi.fn(async ({ page }: { page?: number }) => ({
      totalCount: 4,
      elencoRisultati:
        page === 1
          ? [saleDoc({ idtrx: "1" }), saleDoc({ idtrx: "2" })]
          : [saleDoc({ idtrx: "3" }), saleDoc({ idtrx: "4" })],
    }));

    const result = await fetchAdeSaleRows(
      { searchDocuments },
      { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
    );

    expect(result.rows).toHaveLength(4);
  });

  it("si ferma su una pagina vuota anche se totalCount promette di più", async () => {
    const searchDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        totalCount: 99,
        elencoRisultati: [saleDoc({ idtrx: "1" })],
      })
      .mockResolvedValueOnce({ totalCount: 99, elencoRisultati: [] });

    const result = await fetchAdeSaleRows(
      { searchDocuments },
      { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
    );

    expect(searchDocuments).toHaveBeenCalledTimes(2);
    expect(result.rows).toHaveLength(1);
  });

  it("dichiara il troncamento quando l'archivio supera il tetto", async () => {
    const page = Array.from({ length: 100 }, (_, i) =>
      saleDoc({ idtrx: `doc-${i}` }),
    );
    const searchDocuments = vi.fn().mockResolvedValue({
      totalCount: MAX_ADE_SEARCH_DOCUMENTS + 500,
      elencoRisultati: page,
    });

    const result = await fetchAdeSaleRows(
      { searchDocuments },
      { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
    );

    expect(result.truncated).toBe(true);
    expect(result.rows.length).toBeLessThanOrEqual(MAX_ADE_SEARCH_DOCUMENTS);
  });

  it("non si dichiara troncato quando ha raccolto tutto", async () => {
    const searchDocuments = vi
      .fn()
      .mockResolvedValue({ totalCount: 1, elencoRisultati: [saleDoc()] });

    const result = await fetchAdeSaleRows(
      { searchDocuments },
      { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
    );

    expect(result.truncated).toBe(false);
  });

  it("regge un elencoRisultati assente senza esplodere", async () => {
    const searchDocuments = vi.fn().mockResolvedValue({ totalCount: 0 });

    const result = await fetchAdeSaleRows(
      { searchDocuments },
      { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
    );

    expect(result.rows).toEqual([]);
  });
});
