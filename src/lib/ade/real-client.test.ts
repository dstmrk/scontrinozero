/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RealAdeClient } from "./real-client";
import {
  AdeAuthError,
  AdeNetworkError,
  AdePortalError,
  AdeSessionExpiredError,
} from "./errors";
import type { AdePayload, AdeResponse } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(opts: {
  status?: number;
  body?: string | object;
  headers?: [string, string][];
  location?: string;
}): Response {
  const { status = 200, body = "", headers = [], location } = opts;
  const responseHeaders: [string, string][] = [...headers];
  if (location) {
    responseHeaders.push(["Location", location]);
  }
  const responseBody = typeof body === "object" ? JSON.stringify(body) : body;
  return new Response(responseBody, { status, headers: responseHeaders });
}

/** Queue 6 mock responses for the full login flow (Phases 1-5). */
function mockLoginSequence(fetchMock: ReturnType<typeof vi.fn>): void {
  // Phase 1: GET /portale/web/guest — init cookie jar
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      headers: [["Set-Cookie", "JSESSIONID=abc123; Path=/; HttpOnly"]],
    }),
  );

  // Phase 2: POST login — 302 redirect indicating success
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 302,
      location: "/portale/c/portal/layout",
      headers: [["Set-Cookie", "LFR_SESSION=xyz789; Path=/"]],
    }),
  );

  // Phase 2 follow-up: GET the redirect target
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase 3: GET /dp/api — HTML containing p_auth token
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: '<html><script>Liferay.authToken = "test_p_auth_42";</script></html>',
    }),
  );

  // Phase 4: POST select entity
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase 5: GET ready probe — 200 OK
  fetchMock.mockResolvedValueOnce(mockResponse({}));
}

const mockCredentials = {
  codiceFiscale: "RSSMRA80A01H501A",
  password: "testpassword",
  pin: "12345678",
};

function makeSalePayload(): AdePayload {
  return {
    datiTrasmissione: { formato: "DCW10" },
    cedentePrestatore: {
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
    },
    documentoCommerciale: {
      cfCessionarioCommittente: "",
      flagDocCommPerRegalo: false,
      progressivoCollegato: "",
      dataOra: "15/02/2026",
      multiAttivita: { codiceAttivita: "", descAttivita: "" },
      importoTotaleIva: "1.80",
      scontoTotale: "0.00",
      scontoTotaleLordo: "0.00",
      totaleImponibile: "8.20",
      ammontareComplessivo: "10.00",
      totaleNonRiscosso: "0.00",
      elementiContabili: [
        {
          idElementoContabile: "",
          resiPregressi: "0.00",
          reso: "0.00",
          quantita: "1.00",
          descrizioneProdotto: "Test Product",
          prezzoLordo: "10.00",
          prezzoUnitario: "8.20",
          scontoUnitario: "0.00",
          scontoLordo: "0.00",
          aliquotaIVA: "22",
          importoIVA: "1.80",
          imponibile: "8.20",
          imponibileNetto: "8.20",
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

const successResponse: AdeResponse = {
  esito: true,
  idtrx: "151085589",
  progressivo: "DCW2026/5111-2188",
  errori: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RealAdeClient", () => {
  let fetchMock: ReturnType<typeof vi.fn> & typeof global.fetch;
  let client: RealAdeClient;

  beforeEach(() => {
    fetchMock = vi.fn() as ReturnType<typeof vi.fn> & typeof global.fetch;
    global.fetch = fetchMock;
    client = new RealAdeClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe("login", () => {
    it("completes 6-phase auth flow and returns AdeSession", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      expect(session.pAuth).toBe("test_p_auth_42");
      expect(session.partitaIva).toHaveLength(11);
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it("calls Phase 1 GET /portale/web/guest", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall[0]).toContain("/portale/web/guest");
    });

    it("calls Phase 2 POST with correct form body", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const secondCall = fetchMock.mock.calls[1];
      expect(secondCall[0]).toContain("_58_struts_action");
      expect(secondCall[1].method).toBe("POST");

      const body = secondCall[1].body as string;
      expect(body).toContain("_58_login=RSSMRA80A01H501A");
      expect(body).toContain("_58_password=testpassword");
      expect(body).toContain("_58_pin=12345678");
    });

    it("calls Phase 2 with redirect manual to inspect Location", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const secondCall = fetchMock.mock.calls[1];
      expect(secondCall[1].redirect).toBe("manual");
    });

    it("throws AdeAuthError when Location header indicates failure", async () => {
      // Phase 1
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      // Phase 2: redirect to login page = failure
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 302,
          location: "/portale/home?p_p_id=58&error=true",
        }),
      );

      await expect(client.login(mockCredentials)).rejects.toThrow(AdeAuthError);
    });

    it("calls Phase 3 GET /dp/api and extracts p_auth from HTML", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      // Phase 3 is call index 3
      const phase3Call = fetchMock.mock.calls[3];
      expect(phase3Call[0]).toContain("/dp/api");

      expect(session.pAuth).toBe("test_p_auth_42");
    });

    it("throws AdePortalError when p_auth not found in bootstrap HTML", async () => {
      // Phase 1
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      // Phase 2: success redirect
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 302, location: "/portale/c/portal/layout" }),
      );

      // Phase 2 follow-up
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      // Phase 3: HTML without p_auth
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: "<html>No token here</html>" }),
      );

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("calls Phase 4 POST with p_auth and partitaIva", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      // Phase 4 is call index 4
      const phase4Call = fetchMock.mock.calls[4];
      expect(phase4Call[0]).toContain("p_auth=test_p_auth_42");
      expect(phase4Call[0]).toContain("scelta-utenza-lavoro");
      expect(phase4Call[1].method).toBe("POST");

      const body = phase4Call[1].body as string;
      expect(body).toContain("sceltaincarico=");
      expect(body).toContain("tipoincaricante=ME");
    });

    it("calls Phase 5 GET ready probe", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      // Phase 5 is call index 5
      const phase5Call = fetchMock.mock.calls[5];
      expect(phase5Call[0]).toContain(
        "/ser/api/fatture/v1/ul/me/adesione/stato/",
      );
    });

    it("throws AdePortalError when ready probe returns non-200", async () => {
      // Phases 1-4 succeed
      fetchMock.mockResolvedValueOnce(mockResponse({})); // Phase 1
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 302, location: "/portale/c/portal/layout" }),
      ); // Phase 2
      fetchMock.mockResolvedValueOnce(mockResponse({})); // Phase 2 follow-up
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: '<script>Liferay.authToken = "tok";</script>',
        }),
      ); // Phase 3
      fetchMock.mockResolvedValueOnce(mockResponse({})); // Phase 4

      // Phase 5: non-200
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 503 }));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("throws AdeNetworkError when fetch rejects", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdeNetworkError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // submitSale / submitVoid
  // -----------------------------------------------------------------------

  describe("submitSale", () => {
    it("sends POST with correct headers and JSON payload", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      await client.submitSale(makeSalePayload());

      const submitCall = fetchMock.mock.calls[6];
      expect(submitCall[0]).toContain("/ser/api/documenti/v1/doc/documenti/");
      expect(submitCall[1].method).toBe("POST");

      const headers = submitCall[1].headers as Headers;
      expect(headers.get("Content-Type")).toBe(
        "application/json;charset=UTF-8",
      );
      expect(headers.get("Origin")).toContain(
        "ivaservizi.agenziaentrate.gov.it",
      );
    });

    it("returns AdeResponse on success", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
      expect(result.idtrx).toBe("151085589");
      expect(result.progressivo).toBe("DCW2026/5111-2188");
    });

    it("retries with full re-auth on 401, then succeeds", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // First attempt: 401
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      // Re-auth sequence (6 calls)
      mockLoginSequence(fetchMock);

      // Retry: success
      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitSale(makeSalePayload());
      expect(result.esito).toBe(true);
    });

    it("throws AdeSessionExpiredError when retry also returns 401", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // First attempt: 401
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      // Re-auth sequence (6 calls)
      mockLoginSequence(fetchMock);

      // Retry: still 401
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdeSessionExpiredError,
      );
    });

    it("throws AdePortalError on non-401 error status", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        AdePortalError,
      );
    });

    it("throws if not logged in", async () => {
      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });
  });

  describe("submitVoid", () => {
    it("sends POST and returns AdeResponse", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ body: successResponse }));

      const result = await client.submitVoid(makeSalePayload());
      expect(result.esito).toBe(true);
    });

    it("throws if not logged in", async () => {
      await expect(client.submitVoid(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });
  });

  // -----------------------------------------------------------------------
  // getFiscalData
  // -----------------------------------------------------------------------

  describe("getFiscalData", () => {
    it("sends GET and returns parsed JSON", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const fiscalData = {
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

      fetchMock.mockResolvedValueOnce(mockResponse({ body: fiscalData }));

      const result = await client.getFiscalData();
      expect(result.identificativiFiscali.partitaIva).toBe("12345678901");
    });

    it("throws AdePortalError on non-200", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.getFiscalData()).rejects.toThrow(AdePortalError);
    });

    it("throws if not logged in", async () => {
      await expect(client.getFiscalData()).rejects.toThrow("Not logged in");
    });
  });

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------

  describe("logout", () => {
    it("calls all logout URLs (best-effort)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // 5 logout URLs: 4 service logouts + 1 portal logout
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockResponse({}));
      }

      await client.logout();

      // 6 login calls + 5 logout calls = 11 total
      expect(fetchMock).toHaveBeenCalledTimes(11);
    });

    it("does not throw if logout URLs fail", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // All logout URLs fail
      for (let i = 0; i < 5; i++) {
        fetchMock.mockRejectedValueOnce(new Error("Network error"));
      }

      await expect(client.logout()).resolves.toBeUndefined();
    });

    it("clears session — operations throw after logout", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockResponse({}));
      }

      await client.logout();

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });
  });
});
