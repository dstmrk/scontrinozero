import { describe, expect, it, beforeEach } from "vitest";

import { ADE_MOCK_MULTI_PERSONA_PIN, MockAdeClient } from "./mock-client";
import {
  AdeUtenzaNotAvailableError,
  AdeUtenzaSelectionRequiredError,
} from "./errors";
import { createAdeClient } from "./index";
import { mapSaleToAdePayload } from "./mapper";
import { mapReturnToAdePayload } from "./return-mapper";
import type { AdePayload, AdeCedentePrestatore } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCredentials = {
  codiceFiscale: "RSSMRA80A01H501A",
  password: "testpassword",
  pin: "1234567890",
};

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

function makeSalePayload(): AdePayload {
  return {
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: mockCedentePrestatore,
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "15/02/2026",
      multiAttivita: { codiceAttivita: "", descAttivita: "" },
      importoTotaleIva: "0.00",
      scontoTotale: "0.00",
      scontoTotaleLordo: "0.00",
      totaleImponibile: "10.00",
      ammontareComplessivo: "10.00",
      totaleNonRiscosso: "0.00",
      elementiContabili: [
        {
          idElementoContabile: "",
          resiPregressi: "0.00",
          reso: "0.00",
          quantita: "1.00",
          descrizioneProdotto: "Prodotto test",
          prezzoLordo: "10.00",
          prezzoUnitario: "10.00",
          scontoUnitario: "0.00",
          scontoLordo: "0.00",
          aliquotaIVA: "N2",
          importoIVA: "0.00",
          imponibile: "10.00",
          imponibileNetto: "10.00",
          totale: "10.00",
          omaggio: "N",
        },
      ],
      vendita: [
        { tipo: "PC", importo: "10.00" },
        { tipo: "PE", importo: "0.00" },
        { tipo: "TR", importo: "0.00", numero: "0" },
        { tipo: "NR_EF", importo: "0.00" },
        { tipo: "NR_PS", importo: "0.00" },
        { tipo: "NR_CS", importo: "0.00" },
      ],
      scontoAbbuono: "0.00",
      importoDetraibileDeducibile: "0.00",
    },
    flagIdentificativiModificati: false,
  };
}

function makeVoidPayload(): AdePayload {
  return {
    idtrx: "151085589",
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: mockCedentePrestatore,
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "15/02/2026",
      multiAttivita: { codiceAttivita: "", descAttivita: "" },
      importoTotaleIva: "0.00",
      scontoTotale: "0.00",
      scontoTotaleLordo: "0.00",
      totaleImponibile: "0.00",
      ammontareComplessivo: "0.00",
      totaleNonRiscosso: "0.00",
      elementiContabili: [],
      resoAnnullo: {
        tipologia: "A",
        dataOra: "15/02/2026",
        progressivo: "DCW2026/5111-2188",
      },
      numeroProgressivo: "DCW2026/5111-2188",
      scontoAbbuono: "0.00",
      importoDetraibileDeducibile: "0.00",
    },
    flagIdentificativiModificati: false,
  };
}

// ---------------------------------------------------------------------------
// MockAdeClient
// ---------------------------------------------------------------------------

describe("MockAdeClient", () => {
  let client: MockAdeClient;

  beforeEach(() => {
    client = new MockAdeClient();
  });

  describe("login", () => {
    it("returns a mock session with pAuth and partitaIva", async () => {
      const session = await client.login(mockCredentials);

      expect(session.pAuth).toBeDefined();
      expect(session.pAuth.length).toBeGreaterThan(0);
      expect(session.partitaIva).toBeDefined();
      expect(session.createdAt).toBeGreaterThan(0);
    });
  });

  describe("submitSale", () => {
    it("returns a successful response with idtrx and progressivo", async () => {
      await client.login(mockCredentials);
      const response = await client.submitSale(makeSalePayload());

      expect(response.esito).toBe(true);
      expect(response.idtrx).toBeDefined();
      expect(response.idtrx).not.toBeNull();
      expect(response.progressivo).toBeDefined();
      expect(response.progressivo).not.toBeNull();
      expect(response.errori).toEqual([]);
    });

    it("increments transaction IDs on each call", async () => {
      await client.login(mockCredentials);

      const r1 = await client.submitSale(makeSalePayload());
      const r2 = await client.submitSale(makeSalePayload());

      expect(r1.idtrx).not.toBe(r2.idtrx);
    });

    it("throws if not logged in", async () => {
      await expect(client.submitSale(makeSalePayload())).rejects.toThrow();
    });

    // Il mock deve esporre lo stesso contratto del RealAdeClient (HAR.md #16b),
    // altrimenti ADE_MODE=mock non esercita il percorso che popola
    // ade_registered_at e la ricevuta di annullamento resta senza data in dev.
    it("returns registeredAt as an ISO 8601 UTC timestamp", async () => {
      await client.login(mockCredentials);

      const response = await client.submitSale(makeSalePayload());

      expect(response.registeredAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });

  describe("submitVoid", () => {
    it("returns a successful response for annullo", async () => {
      await client.login(mockCredentials);
      const response = await client.submitVoid(makeVoidPayload());

      expect(response.esito).toBe(true);
      expect(response.idtrx).toBeDefined();
      expect(response.progressivo).toBeDefined();
      expect(response.errori).toEqual([]);
    });

    it("throws if not logged in", async () => {
      await expect(client.submitVoid(makeVoidPayload())).rejects.toThrow();
    });
  });

  describe("getFiscalData", () => {
    it("returns mock cedente/prestatore data", async () => {
      await client.login(mockCredentials);
      const data = await client.getFiscalData();

      expect(data.identificativiFiscali.codicePaese).toBe("IT");
      expect(data.identificativiFiscali.partitaIva).toBeDefined();
      expect(data.altriDatiIdentificativi).toBeDefined();
    });

    it("throws if not logged in", async () => {
      await expect(client.getFiscalData()).rejects.toThrow();
    });
  });

  describe("logout", () => {
    it("clears the session", async () => {
      await client.login(mockCredentials);
      await client.logout();

      // After logout, operations should throw
      await expect(client.submitSale(makeSalePayload())).rejects.toThrow();
    });

    it("does not throw if already logged out", async () => {
      await expect(client.logout()).resolves.toBeUndefined();
    });
  });

  describe("adoptSession", () => {
    it("accetta qualunque header di cookie e restituisce una sessione", async () => {
      const session = await client.adoptSession("JSESSIONID=x");

      expect(session.pAuth).toMatch(/^mock_p_auth_spid_/);
      expect(session.partitaIva).toHaveLength(11);
    });

    it("restituisce i dati fiscali della P.IVA fittizia, come getFiscalData", async () => {
      const { partitaIva, fiscalData } =
        await client.adoptSession("JSESSIONID=x");

      expect(fiscalData.identificativiFiscali.partitaIva).toBe(partitaIva);
      expect(fiscalData).toEqual(await client.getFiscalData());
    });

    it("abilita le operazioni come un login", async () => {
      await client.adoptSession("JSESSIONID=x");
      const response = await client.submitSale(makeSalePayload());

      expect(response.esito).toBe(true);
    });
  });

  describe("loginCie", () => {
    const cieCreds = {
      username: "mario.rossi@example.com",
      password: "ciepassword",
    };

    it("returns a mock session marked as cie", async () => {
      const session = await client.loginCie(cieCreds);

      expect(session.pAuth).toMatch(/^mock_p_auth_cie_/);
      expect(session.partitaIva).toHaveLength(11);
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it("enables subsequent operations like a regular login", async () => {
      await client.loginCie(cieCreds);
      const response = await client.submitSale(makeSalePayload());

      expect(response.esito).toBe(true);
    });
  });

  describe("P.IVA registrata (sandbox)", () => {
    // Un business già collegato che passa a CIE o SPID in sandbox ha una
    // P.IVA registrata: con quella fittizia l'identity guard lo respingerebbe,
    // e il collegamento non arriverebbe mai in fondo.
    const REGISTERED = "12345678901";
    const cieCreds = { username: "mario.rossi@example.com", password: "x" };

    it("SPID: la sessione adottata è della P.IVA registrata", async () => {
      const mock = new MockAdeClient({ registeredPartitaIva: REGISTERED });

      const { partitaIva, fiscalData } =
        await mock.adoptSession("JSESSIONID=x");

      expect(partitaIva).toBe(REGISTERED);
      expect(fiscalData.identificativiFiscali.partitaIva).toBe(REGISTERED);
    });

    it("CIE: senza utenza scelta usa la P.IVA registrata", async () => {
      const mock = new MockAdeClient({ registeredPartitaIva: REGISTERED });

      const session = await mock.loginCie(cieCreds);

      expect(session.partitaIva).toBe(REGISTERED);
    });

    it("CIE: un'utenza scelta vince sulla P.IVA registrata", async () => {
      const mock = new MockAdeClient({ registeredPartitaIva: REGISTERED });

      const session = await mock.loginCie(cieCreds, "98765432109");

      expect(session.partitaIva).toBe("98765432109");
    });

    it("Fisconline resta derivata dal codice fiscale", async () => {
      // Con Fisconline il guard in sandbox si prova cambiando CF: la P.IVA
      // registrata non deve coprirlo.
      const mock = new MockAdeClient({ registeredPartitaIva: REGISTERED });

      const session = await mock.login(mockCredentials);

      expect(session.partitaIva).not.toBe(REGISTERED);
    });

    it("senza P.IVA registrata CIE e SPID restano sulla fittizia", async () => {
      expect((await client.loginCie(cieCreds)).partitaIva).toBe("00000000000");
      expect((await client.adoptSession("JSESSIONID=x")).partitaIva).toBe(
        "00000000000",
      );
    });
  });

  describe("getProducts", () => {
    it("returns an empty array when logged in", async () => {
      await client.login(mockCredentials);
      const products = await client.getProducts();

      expect(products).toEqual([]);
    });

    it("throws if not logged in", async () => {
      await expect(client.getProducts()).rejects.toThrow();
    });
  });

  describe("archivio dei documenti emessi (reso in dev/sandbox)", () => {
    function twoLineSale(): AdePayload {
      return mapSaleToAdePayload(
        {
          date: "2026-10-02",
          lotteryCode: null,
          isGiftDocument: false,
          lines: [
            {
              description: "doppio",
              quantity: 2,
              unitPriceGross: 3,
              lineDiscount: 1,
              vatCode: "22",
              isGift: false,
            },
            {
              description: "singolo",
              quantity: 1,
              unitPriceGross: 2,
              lineDiscount: 0,
              vatCode: "N2",
              isGift: false,
            },
          ],
          payments: [{ type: "CASH", amount: 7 }],
          globalDiscount: 0,
          deductibleAmount: 0,
        },
        mockCedentePrestatore,
      );
    }

    it("conia idtrx e progressivi univoci fra istanze diverse", async () => {
      const a = new MockAdeClient();
      const b = new MockAdeClient();
      await a.login(mockCredentials);
      await b.login(mockCredentials);
      const first = await a.submitSale(twoLineSale());
      const second = await b.submitSale(twoLineSale());

      expect(first.idtrx).not.toBe(second.idtrx);
      expect(first.progressivo).not.toBe(second.progressivo);
    });

    it("il dettaglio di una vendita emessa porta righe e reso a zero", async () => {
      await client.login(mockCredentials);
      const sale = await client.submitSale(twoLineSale());

      const other = new MockAdeClient();
      await other.login(mockCredentials);
      const doc = await other.getDocument(sale.idtrx!);

      expect(doc.documentoCommerciale.numeroProgressivo).toBe(sale.progressivo);
      expect(
        doc.documentoCommerciale.elementiContabili.map((el) => [
          el.descrizioneProdotto,
          el.quantita,
          el.reso,
        ]),
      ).toEqual([
        ["doppio", "2.00", "0"],
        ["singolo", "1.00", "0"],
      ]);
      expect(
        new Set(
          doc.documentoCommerciale.elementiContabili.map(
            (el) => el.idElementoContabile,
          ),
        ).size,
      ).toBe(2);
    });

    it("submitReturn accumula il reso sulle righe della vendita", async () => {
      await client.login(mockCredentials);
      const sale = await client.submitSale(twoLineSale());
      const before = await client.getDocument(sale.idtrx!);

      const response = await client.submitReturn(
        mapReturnToAdePayload({
          cedentePrestatore: mockCedentePrestatore,
          originalDoc: before,
          originalProgressive: sale.progressivo!,
          quantities: [1, 1],
        }),
      );
      expect(response.esito).toBe(true);
      expect(response.idtrx).not.toBe(sale.idtrx);

      const after = await client.getDocument(sale.idtrx!);
      expect(
        after.documentoCommerciale.elementiContabili.map((el) => el.reso),
      ).toEqual(["1", "1"]);
    });

    it("l'archivio ha un tetto: le vendite più vecchie escono per prime", async () => {
      await client.login(mockCredentials);
      const first = await client.submitSale(twoLineSale());
      for (let i = 0; i < 500; i++) await client.submitSale(twoLineSale());

      const evicted = await client.getDocument(first.idtrx!);
      expect(evicted.documentoCommerciale.elementiContabili).toEqual([]);
    });

    it("submitReturn rifiuta come l'AdE quando la vendita non è in archivio", async () => {
      await client.login(mockCredentials);
      const response = await client.submitReturn({
        ...twoLineSale(),
        idtrx: "999",
      });

      expect(response.esito).toBe(false);
      expect(response.errori).toHaveLength(1);
    });

    it("submitReturn senza sessione rifiuta la Promise", async () => {
      await expect(client.submitReturn(twoLineSale())).rejects.toThrow();
    });
  });

  describe("getDocument", () => {
    it("returns a minimal document with the requested idtrx", async () => {
      await client.login(mockCredentials);
      const doc = await client.getDocument("151000123");

      expect(doc.idtrx).toBe("151000123");
      expect(doc.documentoCommerciale).toBeDefined();
      expect(doc.documentoCommerciale.elementiContabili).toEqual([]);
    });

    it("throws if not logged in", async () => {
      await expect(client.getDocument("151000000")).rejects.toThrow();
    });
  });

  describe("searchDocuments", () => {
    it("returns an empty list when logged in", async () => {
      await client.login(mockCredentials);
      const result = await client.searchDocuments({ tipoOperazione: "V" });

      expect(result.totalCount).toBe(0);
      expect(result.elencoRisultati).toEqual([]);
    });

    it("throws if not logged in", async () => {
      await expect(client.searchDocuments({})).rejects.toThrow();
    });
  });

  describe("changePasswordFisconline", () => {
    it("resolves without throwing (mock no-op)", async () => {
      await expect(
        client.changePasswordFisconline({
          codiceFiscale: "RSSMRA80A01H501A",
          oldPassword: "oldpw",
          newPassword: "newpw",
          confirmNewPassword: "newpw",
        }),
      ).resolves.toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// createAdeClient factory
// ---------------------------------------------------------------------------

describe("createAdeClient", () => {
  it('returns MockAdeClient when mode is "mock"', () => {
    const client = createAdeClient("mock");
    expect(client).toBeInstanceOf(MockAdeClient);
  });

  it('returns RealAdeClient when mode is "real"', () => {
    const client = createAdeClient("real");
    expect(client).toBeDefined();
  });

  it("throws for unknown mode", () => {
    expect(() => createAdeClient("unknown" as "mock" | "real")).toThrow();
  });
});

describe("MockAdeClient — utenza di lavoro", () => {
  it("con utenza incaricato la sessione opera sulla P.IVA scelta", async () => {
    const client = new MockAdeClient();

    const session = await client.login(
      { codiceFiscale: "RSSMRA80A01H501A", password: "p", pin: "1234" },
      "07790350966",
    );

    expect(session.partitaIva).toBe("07790350966");
  });

  it("senza utenza resta la P.IVA derivata dal codice fiscale", async () => {
    const client = new MockAdeClient();

    const session = await client.login({
      codiceFiscale: "RSSMRA80A01H501A",
      password: "p",
      pin: "1234",
    });

    expect(session.partitaIva).toBe("RSSMRA80A01");
  });
});

describe("MockAdeClient — utenza multi-persona", () => {
  // Il flusso che ha bloccato un esercente in produzione non era percorribile
  // in dev: il mock rispondeva sempre con una sessione, quindi il picker delle
  // utenze non compariva mai e ogni verifica passava dal solo ambiente reale,
  // su un portale che va toccato con parsimonia. Un PIN sentinella lo apre.
  const multiPersona = {
    ...mockCredentials,
    pin: ADE_MOCK_MULTI_PERSONA_PIN,
  };

  it("chiede di scegliere fra una P.IVA diretta e un incarico", async () => {
    const client = new MockAdeClient();

    const err = await client.login(multiPersona).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AdeUtenzaSelectionRequiredError);
    expect((err as AdeUtenzaSelectionRequiredError).candidates).toEqual([
      {
        piva: "11111111111",
        denominazione: "LA TUA ATTIVITÀ",
        provenienza: "diretta",
      },
      { piva: "22222222222", provenienza: "incarico" },
    ]);
  });

  it("dopo la scelta accede sulla P.IVA scelta", async () => {
    const client = new MockAdeClient();

    const session = await client.login(multiPersona, "11111111111");

    expect(session.partitaIva).toBe("11111111111");
  });

  it("una scelta che l'utenza non offre non è collegabile", async () => {
    const client = new MockAdeClient();

    await expect(client.login(multiPersona, "99999999999")).rejects.toThrow(
      AdeUtenzaNotAvailableError,
    );
  });

  it("con un PIN qualunque il login resta quello di sempre", async () => {
    const client = new MockAdeClient();

    const session = await client.login(mockCredentials);

    expect(session.partitaIva).toBe("RSSMRA80A01");
  });
});
