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

/**
 * Queue 8 mock responses for the full login flow (Phases 1-6b).
 *
 * HTTP call map (HAR-verified, login_ade_fisconline.har):
 *   [0] Phase 1:  GET /portale/web/guest/home      — init cookie jar
 *   [1] Phase 2:  POST login                        — 302 to /portale/c/...
 *   [2] Phase 2b: GET /portale/c/...               — redirect chain follow-up
 *   [3] Phase 3:  GET /portale/web/guest/home       — extract Liferay.authToken
 *   [4] Phase 3b: GET /dp/api                       — DataPower session init (REQUIRED!)
 *   [5] Phase 4:  POST DatiOpzioni portlet           — activate Liferay portlet
 *   [6] Phase 5:  GET adesione/stato/               — verify session (200)
 *   [7] Phase 6:  GET gestori/me                    — fetch real P.IVA
 *
 * HAR fix (login_ade_fisconline.har entry 45): /dp/api initializes the IBM
 * DataPower cross-domain session. Without it, ALL /ser/api/* calls return 401.
 */
function mockLoginSequence(fetchMock: ReturnType<typeof vi.fn>): void {
  // Phase 1: GET /portale/web/guest/home — init cookie jar
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      headers: [["Set-Cookie", "JSESSIONID=abc123; Path=/; HttpOnly"]],
    }),
  );

  // Phase 2: POST login — 302 redirect to /portale/c/... indicating success
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 302,
      location: "/portale/c/portal/layout",
      headers: [["Set-Cookie", "LFR_SESSION=xyz789; Path=/"]],
    }),
  );

  // Phase 2b: GET the redirect target (follows to /portale/web/guest/home)
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase 3: GET /portale/web/guest/home — HTML containing Liferay.authToken
  // HAR fix: /dp/api returns empty body — authToken is in home page HTML
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: '<html><script>Liferay.authToken = "test_p_auth_42";</script></html>',
    }),
  );

  // Phase 3b: GET /dp/api — DataPower session initialization ping
  // HAR fix (entry 45): /dp/api response body is empty, but the call itself
  // initializes the backend session token for ALL /ser/api/* endpoints.
  // Without this call, verifySession (Phase 5) returns 401.
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase 4: POST DatiOpzioni_WAR_DatiOpzioniportlet — Liferay portlet activation
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase 5: GET /ser/api/fatture/v1/ul/me/adesione/stato/ — verify session
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase 6: GET /ser/api/portale/v1/gestori/me/ — fetch real P.IVA
  // HAR fix: P.IVA must come from this endpoint, NOT derived from CF
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: {
        anagrafica: {
          piva: "12345678901",
          cf: "RSSMRA80A01H501A",
        },
      },
    }),
  );
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
    it("completes 7-phase auth flow (8 HTTP calls) and returns AdeSession", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      expect(session.pAuth).toBe("test_p_auth_42");
      // P.IVA now comes from Phase 6 gestori/me, not derived from CF
      expect(session.partitaIva).toBe("12345678901");
      expect(session.createdAt).toBeGreaterThan(0);
      // Total: 8 fetch calls (Phase 2 has a follow-up redirect + Phase 3b DataPower ping)
      expect(fetchMock).toHaveBeenCalledTimes(8);
    });

    it("calls Phase 1 GET /portale/web/guest/home (not /portale/web/guest)", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const firstCall = fetchMock.mock.calls[0];
      // HAR fix: must hit /portale/web/guest/home to get correct session cookies
      expect(firstCall[0]).toContain("/portale/web/guest/home");
    });

    it("calls Phase 2 POST with correct form body (including 4 previously missing params)", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const secondCall = fetchMock.mock.calls[1];
      expect(secondCall[0]).toContain("_58_struts_action");
      // HAR fix: correct col_pos and col_count
      expect(secondCall[0]).toContain("p_p_col_pos=4");
      expect(secondCall[0]).toContain("p_p_col_count=6");
      expect(secondCall[1].method).toBe("POST");

      const body = secondCall[1].body as string;
      expect(body).toContain("_58_login=RSSMRA80A01H501A");
      expect(body).toContain("_58_password=testpassword");
      expect(body).toContain("_58_pin=12345678");
      // HAR fix: 4 previously missing params
      expect(body).toContain("_58_saveLastPath=false");
      expect(body).toContain("_58_redirect=");
      expect(body).toContain("_58_doActionAfterLogin=false");
      expect(body).toContain("ricorda-cf=on");
    });

    it("calls Phase 2 with redirect manual to inspect Location", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const secondCall = fetchMock.mock.calls[1];
      expect(secondCall[1].redirect).toBe("manual");
    });

    it("follows Phase 2 redirect chain hop-by-hop, capturing cookies at each redirect", async () => {
      // Regression test for: "redirect count exceeded" in postLogin.
      //
      // Root cause: using fetch with redirect:'follow' for the Phase 2
      // follow-up meant intermediate redirect responses were consumed
      // internally by Node.js without updating our cookie jar. If the portal
      // set session cookies in an intermediate redirect, those were lost,
      // making the next hop look unauthenticated → redirect loop → error.
      //
      // Fix: followRedirectChain() follows each hop manually via
      // redirect:'manual', ensuring applyResponse() is called on every
      // response and the cookie jar stays in sync.

      // Phase 1
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          headers: [["Set-Cookie", "JSESSIONID=abc123; Path=/; HttpOnly"]],
        }),
      );
      // Phase 2: POST login → 302
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 302,
          location: "/portale/c/portal/layout",
          headers: [["Set-Cookie", "LFR_SESSION=xyz789; Path=/"]],
        }),
      );
      // Phase 2 follow-up hop 1: intermediate redirect (sets a session cookie)
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 302,
          location: "/portale/web/guest/home",
          headers: [["Set-Cookie", "SESSION_MARKER=important; Path=/"]],
        }),
      );
      // Phase 2 follow-up hop 2: final 200
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase 3
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: '<html><script>Liferay.authToken = "chain_auth_token";</script></html>',
        }),
      );
      // Phase 3b: DataPower session init
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase 4
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase 5
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase 6
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { anagrafica: { piva: "12345678901" } } }),
      );

      const session = await client.login(mockCredentials);

      // Login must succeed despite the intermediate redirect
      expect(session.pAuth).toBe("chain_auth_token");

      // Phase 2 follow-up now takes 2 fetch calls (hop1 + hop2)
      // Total: 1(P1) + 1(P2 POST) + 2(P2 chain) + 1(P3) + 1(P3b) + 1(P4) + 1(P5) + 1(P6) = 9
      expect(fetchMock).toHaveBeenCalledTimes(9);

      // Each hop in the chain must use redirect:'manual'
      expect(fetchMock.mock.calls[2][1].redirect).toBe("manual"); // hop 1
      expect(fetchMock.mock.calls[3][1].redirect).toBe("manual"); // hop 2
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

    it("calls Phase 3 GET /portale/web/guest/home and extracts Liferay.authToken", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      // Phase 3 is call index 3
      const phase3Call = fetchMock.mock.calls[3];
      // HAR fix: /dp/api returns empty body — token is in home page HTML
      expect(phase3Call[0]).toContain("/portale/web/guest/home");
      expect(phase3Call[0]).not.toContain("/dp/api");

      expect(session.pAuth).toBe("test_p_auth_42");
    });

    it("calls Phase 3b GET /dp/api to initialize DataPower session", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      // Phase 3b is call index 4
      // HAR fix (login_ade_fisconline.har entry 45): without this call ALL
      // /ser/api/* endpoints return 401. The response body is empty — the
      // call matters only for its side-effect (establishes DataPower session).
      const phase3bCall = fetchMock.mock.calls[4];
      expect(phase3bCall[0]).toContain("/dp/api");
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

    it("calls Phase 4 POST to DatiOpzioni portlet (required to activate session)", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      // Phase 4 is call index 5 (Phase 3b DataPower ping is at index 4)
      const phase4Call = fetchMock.mock.calls[5];
      // HAR fix: DatiOpzioni portlet replaces selectEntity (not in HAR flow)
      expect(phase4Call[0]).toContain("DatiOpzioni_WAR_DatiOpzioniportlet");
      expect(phase4Call[1].method).toBe("POST");

      const body = phase4Call[1].body as string;
      expect(body).toContain(
        "_DatiOpzioni_WAR_DatiOpzioniportlet_reload=false",
      );
    });

    it("calls Phase 5 GET ready probe", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      // Phase 5 is call index 6 (Phase 3b DataPower ping is at index 4)
      const phase5Call = fetchMock.mock.calls[6];
      expect(phase5Call[0]).toContain(
        "/ser/api/fatture/v1/ul/me/adesione/stato/",
      );
    });

    it("calls Phase 6 GET gestori/me and returns real P.IVA", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      // Phase 6 is call index 7 (Phase 3b DataPower ping is at index 4)
      const phase6Call = fetchMock.mock.calls[7];
      // HAR fix: P.IVA from gestori/me, not derived from CF (slice+padEnd was wrong)
      expect(phase6Call[0]).toContain("/ser/api/portale/v1/gestori/me/");
      expect(session.partitaIva).toBe("12345678901");
    });

    it("throws AdePortalError when ready probe returns non-200", async () => {
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
      fetchMock.mockResolvedValueOnce(mockResponse({})); // Phase 3b DataPower ping
      fetchMock.mockResolvedValueOnce(mockResponse({})); // Phase 4 DatiOpzioni

      // Phase 5 verifySession: non-200 → should throw
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

      // Login uses 8 calls (Phases 1-6 + Phase 3b DataPower), so submit is call index 8
      const submitCall = fetchMock.mock.calls[8];
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
  // getDocument
  // -----------------------------------------------------------------------

  describe("getDocument", () => {
    it("sends GET to correct URL and returns parsed document", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const mockDoc = {
        idtrx: "151085589",
        numeroProgressivo: "DCW2026/5111-2188",
        cfCessionarioCommittente: "",
        data: "02/15/2026",
        tipoOperazione: "V",
        flagDocCommPerRegalo: false,
        progressivoCollegato: "",
        dataOra: "15/02/2026",
        multiAttivita: { codiceAttivita: "", descAttivita: "" },
        importoTotaleIva: "2.20000000",
        scontoTotale: "0.00000000",
        scontoTotaleLordo: "0.00000000",
        totaleImponibile: "10.00000000",
        ammontareComplessivo: "12.20000000",
        totaleNonRiscosso: "0.00000000",
        scontoAbbuono: "0.00",
        importoDetraibileDeducibile: "0.00000000",
        elementiContabili: [
          {
            idElementoContabile: "270270040",
            resiPregressi: "0.00",
            reso: "0.00",
            quantita: "1.00",
            descrizioneProdotto: "Prodotto",
            prezzoLordo: "12.20000000",
            prezzoUnitario: "10.00000000",
            scontoUnitario: "0.00000000",
            scontoLordo: "0.00000000",
            aliquotaIVA: "22",
            importoIVA: "2.20000000",
            imponibile: "10.00000000",
            imponibileNetto: "10.00000000",
            totale: "12.20000000",
            omaggio: "N",
          },
        ],
      };

      fetchMock.mockResolvedValueOnce(mockResponse({ body: mockDoc }));

      const result = await client.getDocument("151085589");

      // URL corretto: /documenti/{idtrx}/
      const call = fetchMock.mock.calls[8];
      expect(call[0]).toContain(
        "/ser/api/documenti/v1/doc/documenti/151085589/",
      );

      expect(result.idtrx).toBe("151085589");
      expect(result.elementiContabili[0].idElementoContabile).toBe("270270040");
      expect(result.totaleImponibile).toBe("10.00000000");
    });

    it("throws AdePortalError on non-200", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 404 }));

      await expect(client.getDocument("999")).rejects.toThrow(AdePortalError);
    });

    it("throws if not logged in", async () => {
      await expect(client.getDocument("123")).rejects.toThrow("Not logged in");
    });
  });

  // -----------------------------------------------------------------------
  // searchDocuments
  // -----------------------------------------------------------------------

  describe("searchDocuments", () => {
    it("sends GET with dataDal/dataInvioAl params and returns list", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      const mockList = {
        totalCount: 1,
        elencoRisultati: [
          {
            idtrx: "151085589",
            numeroProgressivo: "DCW2026/5111-2188",
            cfCliente: "",
            data: "02/15/2026",
            tipoOperazione: "V",
            ammontareComplessivo: "12.20",
            annulli: null,
          },
        ],
      };

      fetchMock.mockResolvedValueOnce(mockResponse({ body: mockList }));

      const result = await client.searchDocuments({
        dataDal: "02/15/2026",
        dataInvioAl: "02/15/2026",
        page: 1,
        perPage: 10,
      });

      // HAR fix (annullo.har [03]): URL con query string corretta
      const call = fetchMock.mock.calls[8];
      expect(call[0]).toContain("/ser/api/documenti/v1/doc/documenti/");
      expect(call[0]).toContain("dataDal=");
      expect(call[0]).toContain("02%2F15%2F2026");

      expect(result.totalCount).toBe(1);
      expect(result.elencoRisultati).toHaveLength(1);
      expect(result.elencoRisultati[0].idtrx).toBe("151085589");
    });

    it("sends GET with numeroProgressivo param", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { totalCount: 1, elencoRisultati: [] } }),
      );

      await client.searchDocuments({
        numeroProgressivo: "DCW2026/5111-2188",
        tipoOperazione: "V",
      });

      // HAR fix (annullo.har [04]): ricerca per progressivo
      const call = fetchMock.mock.calls[8];
      expect(call[0]).toContain("numeroProgressivo=");
      expect(call[0]).toContain("tipoOperazione=V");
    });

    it("throws AdePortalError on non-200", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

      await expect(client.searchDocuments({})).rejects.toThrow(AdePortalError);
    });

    it("throws if not logged in", async () => {
      await expect(client.searchDocuments({})).rejects.toThrow("Not logged in");
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

      // 8 login calls (Phases 1-6 + Phase 3b DataPower) + 5 logout calls = 13 total
      expect(fetchMock).toHaveBeenCalledTimes(13);
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
