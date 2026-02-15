import { describe, expect, it, beforeEach } from "vitest";

import { MockAdeClient } from "./mock-client";
import { createAdeClient } from "./index";
import type { AdePayload, AdeCedentePrestatore } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCredentials = {
  codiceFiscale: "RSSMRA80A01H501A",
  password: "testpassword",
  pin: "12345678",
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
});

// ---------------------------------------------------------------------------
// createAdeClient factory
// ---------------------------------------------------------------------------

describe("createAdeClient", () => {
  it('returns MockAdeClient when mode is "mock"', () => {
    const client = createAdeClient("mock");
    expect(client).toBeInstanceOf(MockAdeClient);
  });

  it('throws for "real" mode (not yet implemented)', () => {
    expect(() => createAdeClient("real")).toThrow();
  });

  it("throws for unknown mode", () => {
    expect(() => createAdeClient("unknown" as "mock" | "real")).toThrow();
  });
});
