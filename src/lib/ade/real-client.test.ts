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
  AdeSpidTimeoutError,
} from "./errors";
import type { AdePayload, AdeResponse, SpidCredentials } from "./types";

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
 * Queue 7 mock responses for the full Fisconline login flow (Phases A-G).
 *
 * HTTP call map (HAR-verified, login_credenziali_fisconline.har):
 *   [0] Phase A: POST iampe/api/login/telematico    — 200 (login IAM)
 *   [1] Phase B: GET portale/PortaleWeb/home         — SSO bridge
 *   [2] Phase C: GET ivaservizi/instr/...home        — instradamento home
 *   [3] Phase E: GET instr/.../initLight             — x-appl in risposta header
 *   [4] Phase D: GET ivaservizi/dp/PI2FC             — DataPower bridge
 *   [5] Phase F: GET instr/.../wizardTemplate        — P.IVA list
 *   [6] Phase G: POST instr/.../setUserChoice        — attiva sessione
 */
function mockLoginSequence(fetchMock: ReturnType<typeof vi.fn>): void {
  // Phase A: POST iampe/api/login/telematico — 200
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 }));

  // Phase B: GET portale/PortaleWeb/home?to=FATBTB — SSO bridge
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase C: GET ivaservizi/instr/InstradamentofcWeb/home — instradamento
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase E: GET initLight — x-appl in response header
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      headers: [["x-appl", "test_x_appl_token"]],
    }),
  );

  // Phase D: GET ivaservizi/dp/PI2FC — DataPower session bridge
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // Phase F: GET wizardTemplate — P.IVA list
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: { PIva: [{ piva: "12345678901", denominazione: "TEST SRL" }] },
    }),
  );

  // Phase G: POST setUserChoice — activate session
  fetchMock.mockResolvedValueOnce(mockResponse({}));
}

/**
 * Queue 6 mock responses for re-auth on 401 (Phases A-E + G, skip F).
 *
 * Phase F (wizardTemplate) è skippata perché la P.IVA è già nota.
 */
function mockReAuthSequence(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
  fetchMock.mockResolvedValueOnce(mockResponse({})); // B
  fetchMock.mockResolvedValueOnce(mockResponse({})); // C
  fetchMock.mockResolvedValueOnce(
    mockResponse({ headers: [["x-appl", "test_x_appl_token"]] }),
  ); // E
  fetchMock.mockResolvedValueOnce(mockResponse({})); // D
  fetchMock.mockResolvedValueOnce(mockResponse({})); // G (no F)
}

const mockCredentials = {
  codiceFiscale: "RSSMRA80A01H501A",
  password: "testpassword",
  pin: "12345678",
};

const mockSpidCredentials: SpidCredentials = {
  codiceFiscale: "RSSMRA80A01H501A",
  password: "testpassword",
  spidProvider: "sielte",
};

// ---------------------------------------------------------------------------
// SPID login mock sequence (18 HTTP calls)
//
// HTTP call map (HAR-verified, login_spid.har):
//   [0]  S1:  GET ADE_BASE_URL/dp/SPID/sielte/s4       — SAML request form
//   [1]  S2:  POST IdP SSOService.php                   — 303 → loginform
//   [2]  S3:  GET IdP loginform.php?AuthState=...        — login form
//   [3]  S4:  POST IdP loginform (credentials)           — 200 (2FA choice)
//   [4]  S4b: POST IdP loginform (usenotify=true)        — 200 (waiting page)
//   [5]  S5a: POST IdP NotifyPage (poll 1 — pending)     — 200 "pending"
//   [6]  S5b: POST IdP NotifyPage (poll 2 — approved)    — 200 "approved!" (different)
//   [7]  S6:  POST IdP loginform (accedi=1)              — 303 → accept.php
//   [8]  S7:  GET IdP accept.php?AuthState=...           — 200
//   [9]  S8:  POST IdP accept.php (accept=true)          — 200 (SAMLResponse form)
//   [10] S9:  POST ADE_BASE_URL/dp/SPID (SAMLResponse)   — 302 → /portale/c/...
//   [11] S10: GET /portale/c/... (redirect chain hop)    — 200
//   [12] S11: GET /portale/web/guest/home               — HTML with authToken [extractPAuth]
//   [13] S12: GET /dp/api                               — 200 [initDataPowerSession]
//   [14] S13: POST DatiOpzioni portlet                   — 200 [activateSession]
//   [15] S14: GET adesione/stato/                        — 200 [verifySession]
//   [16] S15a: GET gestori/me/                           — 404 (SPID users!)
//   [17] S15b: GET dati/fiscali                          — 200 with partitaIva [fallback]
//
// HAR findings:
//   - gestori/me returns 404 for SPID users → must fall back to dati/fiscali
//   - IdP uses SAML2 HTTP POST Binding (SimpleSAMLphp, tested with Sielte)
//   - 2FA via push notification: poll NotifyPage until body changes
// ---------------------------------------------------------------------------
function mockSpidLoginSequence(fetchMock: ReturnType<typeof vi.fn>): void {
  // S1: GET ADE_BASE_URL/dp/SPID/sielte/s4 — AdE SP returns SAML request form
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: `<html><body>
        <form action="https://identity.sieltecloud.it/simplesaml/saml2/idp/SSOService.php" method="post">
          <input type="hidden" name="SAMLRequest" value="mock_saml_request_base64" />
          <input type="hidden" name="RelayState" value="FeC" />
          <input type="submit" value="Accedi" />
        </form>
      </body></html>`,
    }),
  );

  // S2: POST IdP SSOService — 303 redirect to loginform with AuthState
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 303,
      location:
        "https://identity.sieltecloud.it/simplesaml/module.php/core/loginuserpass.php?AuthState=_mock_auth_state_123",
      headers: [["Set-Cookie", "SimpleSAMLSessionID=abc; Path=/; HttpOnly"]],
    }),
  );

  // S3: GET loginform.php — login form HTML
  fetchMock.mockResolvedValueOnce(
    mockResponse({ body: "<html><body>Login form</body></html>" }),
  );

  // S4: POST credentials — 200 (2FA method choice page)
  fetchMock.mockResolvedValueOnce(
    mockResponse({ body: "<html><body>Choose 2FA method</body></html>" }),
  );

  // S4b: POST usenotify=true — 200 (waiting for push, NotifyPage URL embedded)
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: `<html><body>
        <script>
          var notifyUrl = 'https://identity.sieltecloud.it/simplesaml/module.php/notify/NotifyPage.php';
        </script>
        <p>Waiting for push notification...</p>
      </body></html>`,
    }),
  );

  // S5a: POST NotifyPage — pending (same body)
  fetchMock.mockResolvedValueOnce(mockResponse({ body: "<pending/>" }));

  // S5b: POST NotifyPage — approved (different body triggers exit from poll)
  fetchMock.mockResolvedValueOnce(mockResponse({ body: "<approved/>" }));

  // S6: POST loginform (accedi=1) — 303 → accept.php
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 303,
      location:
        "https://identity.sieltecloud.it/simplesaml/module.php/saml/sp/accept.php?AuthState=_mock_auth_state_123",
    }),
  );

  // S7: GET accept.php — 200 (consent page)
  fetchMock.mockResolvedValueOnce(
    mockResponse({ body: "<html><body>Accept SPID login?</body></html>" }),
  );

  // S8: POST accept.php (accept=true) — 200 with SAMLResponse auto-submit form
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: `<html><body>
        <form action="https://ivaservizi.agenziaentrate.gov.it/dp/SPID" method="post">
          <input type="hidden" name="SAMLResponse" value="mock_saml_response_base64" />
          <input type="hidden" name="RelayState" value="FeC" />
          <input type="submit" value="Invia" />
        </form>
      </body></html>`,
    }),
  );

  // S9: POST ADE_BASE_URL/dp/SPID (SAMLResponse) — 302 → /portale/c/...
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 302,
      location: "/portale/c/portal/layout",
      headers: [["Set-Cookie", "LFR_SESSION=spidxyz; Path=/"]],
    }),
  );

  // S10: GET /portale/c/... — followRedirectChain hop → 200
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // S11: GET /portale/web/guest/home — extractPAuth (HTML with authToken)
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: '<html><script>Liferay.authToken = "spid_test_p_auth";</script></html>',
    }),
  );

  // S12: GET /dp/api — initDataPowerSession
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // S13: POST DatiOpzioni — activateSession
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // S14: GET adesione/stato/ — verifySession
  fetchMock.mockResolvedValueOnce(mockResponse({}));

  // S15a: GET gestori/me/ — 404 for SPID users
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 404 }));

  // S15b: GET dati/fiscali — P.IVA fallback for SPID
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: {
        identificativiFiscali: {
          partitaIva: "12345678901",
          codiceFiscale: "RSSMRA80A01H501A",
          codicePaese: "IT",
        },
      },
    }),
  );
}

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
    // spidPollIntervalMs: 0 avoids real delays in SPID polling tests
    client = new RealAdeClient({ spidPollIntervalMs: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe("login", () => {
    it("completes 7-phase auth flow (A-G, 7 HTTP calls) and returns AdeSession", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      expect(session.pAuth).toBe(""); // pAuth è obsoleto nel nuovo flusso IAM
      expect(session.partitaIva).toBe("12345678901");
      expect(session.createdAt).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    it("Phase A: POST JSON con credenziali a iampe.agenziaentrate.gov.it", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callA = fetchMock.mock.calls[0];
      expect(callA[0]).toContain(
        "iampe.agenziaentrate.gov.it/api/login/telematico",
      );
      expect(callA[1].method).toBe("POST");

      const body = JSON.parse(callA[1].body as string) as Record<
        string,
        string
      >;
      expect(body.username).toBe("RSSMRA80A01H501A");
      expect(body.password).toBe("testpassword");
      expect(body.pin).toBe("12345678");
    });

    it("Phase A: lancia AdeAuthError se la risposta non è 200", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      await expect(client.login(mockCredentials)).rejects.toThrow(AdeAuthError);
    });

    it("Phase B: GET portale.agenziaentrate.gov.it/PortaleWeb/home?to=FATBTB", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callB = fetchMock.mock.calls[1];
      expect(callB[0]).toContain(
        "portale.agenziaentrate.gov.it/PortaleWeb/home",
      );
      expect(callB[0]).toContain("to=FATBTB");
    });

    it("Phase C: GET instradamento home con redirect chain", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callC = fetchMock.mock.calls[2];
      expect(callC[0]).toContain(
        "ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home",
      );
    });

    it("Phase C: segue redirect chain hop-by-hop catturando i cookie", async () => {
      // Phase A
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 }));
      // Phase B
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase C hop 1: redirect intermedio (es. SSO iampe)
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 302,
          location:
            "https://ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/home",
          headers: [["Set-Cookie", "SESSION_MARKER=important; Path=/"]],
        }),
      );
      // Phase C hop 2: risposta finale 200
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase E
      fetchMock.mockResolvedValueOnce(
        mockResponse({ headers: [["x-appl", "chain_x_appl"]] }),
      );
      // Phase D
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // Phase F
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "12345678901" }] } }),
      );
      // Phase G
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      const session = await client.login(mockCredentials);

      expect(session.partitaIva).toBe("12345678901");
      // 1(A) + 1(B) + 2(C redirect chain) + 1(D) + 1(E) + 1(F) + 1(G) = 8
      expect(fetchMock).toHaveBeenCalledTimes(8);
      // hop 2 usa redirect:'manual'
      expect(fetchMock.mock.calls[3][1].redirect).toBe("manual");
    });

    it("Phase E: GET initLight ed estrae x-appl dall'header di risposta", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callE = fetchMock.mock.calls[3];
      expect(callE[0]).toContain("initLight");
    });

    it("Phase D: GET ivaservizi/dp/PI2FC per DataPower session bridge", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callD = fetchMock.mock.calls[4];
      expect(callD[0]).toContain("ivaservizi.agenziaentrate.gov.it/dp/PI2FC");
    });

    it("Phase E: lancia AdePortalError se l'header x-appl è assente", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
      fetchMock.mockResolvedValueOnce(mockResponse({})); // B
      fetchMock.mockResolvedValueOnce(mockResponse({})); // C
      // E: initLight senza header x-appl (D non viene mai chiamato)
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("Phase F: GET wizardTemplate con x-appl header e restituisce P.IVA", async () => {
      mockLoginSequence(fetchMock);

      const session = await client.login(mockCredentials);

      const callF = fetchMock.mock.calls[5];
      expect(callF[0]).toContain("wizardTemplate");
      const headers = callF[1].headers as Headers;
      expect(headers.get("x-appl")).toBe("test_x_appl_token");
      expect(session.partitaIva).toBe("12345678901");
    });

    it("Phase F: lancia AdePortalError se la lista PIva è vuota", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
      fetchMock.mockResolvedValueOnce(mockResponse({})); // B
      fetchMock.mockResolvedValueOnce(mockResponse({})); // C
      fetchMock.mockResolvedValueOnce(mockResponse({})); // D
      fetchMock.mockResolvedValueOnce(
        mockResponse({ headers: [["x-appl", "tok"]] }),
      ); // E
      // F: lista PIva vuota
      fetchMock.mockResolvedValueOnce(mockResponse({ body: { PIva: [] } }));

      await expect(client.login(mockCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("Phase G: POST setUserChoice con x-appl header e body corretto", async () => {
      mockLoginSequence(fetchMock);

      await client.login(mockCredentials);

      const callG = fetchMock.mock.calls[6];
      expect(callG[0]).toContain("setUserChoice");
      expect(callG[1].method).toBe("POST");

      const body = JSON.parse(callG[1].body as string) as Record<
        string,
        string
      >;
      expect(body.cf).toBe("RSSMRA80A01H501A");
      expect(body.pIva).toBe("12345678901");
      expect(body.tipoutenza).toBe("meStesso");

      const headers = callG[1].headers as Headers;
      expect(headers.get("x-appl")).toBe("test_x_appl_token");
    });

    it("Phase G: lancia AdePortalError se setUserChoice restituisce non-200", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 })); // A
      fetchMock.mockResolvedValueOnce(mockResponse({})); // B
      fetchMock.mockResolvedValueOnce(mockResponse({})); // C
      fetchMock.mockResolvedValueOnce(mockResponse({})); // D
      fetchMock.mockResolvedValueOnce(
        mockResponse({ headers: [["x-appl", "tok"]] }),
      ); // E
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: { PIva: [{ piva: "12345678901" }] } }),
      ); // F
      // G: setUserChoice → 500
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }));

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
  // loginSpid
  // -----------------------------------------------------------------------

  describe("loginSpid", () => {
    it("completes full SPID flow (18 HTTP calls) and returns AdeSession", async () => {
      mockSpidLoginSequence(fetchMock);

      const session = await client.loginSpid(mockSpidCredentials);

      expect(session.pAuth).toBe("spid_test_p_auth");
      // P.IVA from dati/fiscali fallback (gestori/me → 404 for SPID users)
      expect(session.partitaIva).toBe("12345678901");
      expect(session.createdAt).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(18);
    });

    it("S1: calls GET /dp/SPID/{provider}/s4 on AdE portal", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid({
        ...mockSpidCredentials,
        spidProvider: "sielte",
      });

      const s1Call = fetchMock.mock.calls[0];
      expect(s1Call[0]).toContain(
        "ivaservizi.agenziaentrate.gov.it/dp/SPID/sielte/s4",
      );
      expect(s1Call[1]?.method).toBeUndefined(); // GET (no method = default GET)
    });

    it("S1: uses correct provider path segment", async () => {
      // Mock with a different provider to verify the path changes
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: `<html><body>
            <form action="https://identity.poste.it/spid/saml2/SSOService.php" method="post">
              <input type="hidden" name="SAMLRequest" value="mock_saml" />
              <input type="hidden" name="RelayState" value="FeC" />
            </form>
          </body></html>`,
        }),
      );
      // Remaining calls not needed — just checking S1
      // Use poste provider
      const promise = client.loginSpid({
        ...mockSpidCredentials,
        spidProvider: "poste",
      });
      // The call will fail after S1 but we only care about S1's URL
      await promise.catch(() => {});

      expect(fetchMock.mock.calls[0][0]).toContain("/dp/SPID/poste/s4");
    });

    it("S2: POSTs SAMLRequest and RelayState to IdP SSOService", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s2Call = fetchMock.mock.calls[1];
      expect(s2Call[0]).toContain("SSOService.php");
      expect(s2Call[1].method).toBe("POST");

      const body = s2Call[1].body as string;
      expect(body).toContain("SAMLRequest=mock_saml_request_base64");
      expect(body).toContain("RelayState=FeC");
    });

    it("S3: GETs loginform at URL from S2 redirect Location", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s3Call = fetchMock.mock.calls[2];
      // URL from S2 Location header
      expect(s3Call[0]).toContain("loginuserpass.php");
      expect(s3Call[0]).toContain("AuthState=_mock_auth_state_123");
    });

    it("S4: POSTs codiceFiscale and password to loginform", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s4Call = fetchMock.mock.calls[3];
      expect(s4Call[1].method).toBe("POST");

      const body = s4Call[1].body as string;
      expect(body).toContain("username=RSSMRA80A01H501A");
      expect(body).toContain("password=testpassword");
    });

    it("S4b: POSTs usenotify=true to trigger push 2FA", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s4bCall = fetchMock.mock.calls[4];
      expect(s4bCall[1].method).toBe("POST");

      const body = s4bCall[1].body as string;
      expect(body).toContain("usenotify=true");
    });

    it("S5: polls NotifyPage with X-Requested-With: XMLHttpRequest", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      // Two poll calls: S5a (index 5) and S5b (index 6)
      const s5aCall = fetchMock.mock.calls[5];
      expect(s5aCall[0]).toContain("NotifyPage");
      expect(s5aCall[1].method).toBe("POST");

      const headers = s5aCall[1].headers as Headers;
      expect(headers.get("X-Requested-With")).toBe("XMLHttpRequest");

      const s5bCall = fetchMock.mock.calls[6];
      expect(s5bCall[0]).toContain("NotifyPage");
    });

    it("S5: stops polling when response body changes (approval detected)", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      // Only 2 poll calls (S5a pending, S5b approved) — not more
      // S6 (index 7) must be POST with accedi=1, not another poll
      const s6Call = fetchMock.mock.calls[7];
      const body = s6Call[1].body as string;
      expect(body).toContain("accedi=1");
    });

    it("S6: POSTs accedi=1 to loginform after push approval", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s6Call = fetchMock.mock.calls[7];
      expect(s6Call[1].method).toBe("POST");

      const body = s6Call[1].body as string;
      expect(body).toContain("accedi=1");
    });

    it("S7: GETs accept.php at URL from S6 redirect Location", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s7Call = fetchMock.mock.calls[8];
      expect(s7Call[0]).toContain("accept.php");
      expect(s7Call[0]).toContain("AuthState=_mock_auth_state_123");
    });

    it("S8: POSTs accept=true to accept.php to get SAMLResponse", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s8Call = fetchMock.mock.calls[9];
      expect(s8Call[1].method).toBe("POST");
      expect(s8Call[0]).toContain("accept.php");

      const body = s8Call[1].body as string;
      expect(body).toContain("accept=true");
    });

    it("S9: POSTs SAMLResponse to AdE /dp/SPID", async () => {
      mockSpidLoginSequence(fetchMock);

      await client.loginSpid(mockSpidCredentials);

      const s9Call = fetchMock.mock.calls[10];
      expect(s9Call[0]).toContain("ivaservizi.agenziaentrate.gov.it/dp/SPID");
      expect(s9Call[1].method).toBe("POST");

      const body = s9Call[1].body as string;
      expect(body).toContain("SAMLResponse=mock_saml_response_base64");
      expect(body).toContain("RelayState=FeC");
    });

    it("S11: extracts Liferay.authToken from /portale/web/guest/home", async () => {
      mockSpidLoginSequence(fetchMock);

      const session = await client.loginSpid(mockSpidCredentials);

      // extractPAuth is call index 12
      const extractCall = fetchMock.mock.calls[12];
      expect(extractCall[0]).toContain("/portale/web/guest/home");
      expect(session.pAuth).toBe("spid_test_p_auth");
    });

    it("S15: falls back to dati/fiscali when gestori/me returns 404 (SPID users)", async () => {
      mockSpidLoginSequence(fetchMock);

      const session = await client.loginSpid(mockSpidCredentials);

      // gestori/me call: index 16 → 404
      const gestoriCall = fetchMock.mock.calls[16];
      expect(gestoriCall[0]).toContain("/gestori/me/");

      // dati/fiscali fallback: index 17
      const fiscaliCall = fetchMock.mock.calls[17];
      expect(fiscaliCall[0]).toContain("dati/fiscali");

      expect(session.partitaIva).toBe("12345678901");
    });

    it("throws AdeSpidTimeoutError when push notification not approved within maxPolls", async () => {
      const timeoutClient = new RealAdeClient({
        spidPollIntervalMs: 0,
        spidMaxPolls: 1,
      });

      // S1: SAML request form
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: `<html><body>
            <form action="https://identity.sieltecloud.it/simplesaml/saml2/idp/SSOService.php" method="post">
              <input type="hidden" name="SAMLRequest" value="mock_saml" />
              <input type="hidden" name="RelayState" value="FeC" />
            </form>
          </body></html>`,
        }),
      );
      // S2: redirect to loginform
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          status: 303,
          location:
            "https://identity.sieltecloud.it/simplesaml/module.php/core/loginuserpass.php?AuthState=_xyz",
        }),
      );
      // S3: loginform
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // S4: credentials
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      // S4b: usenotify → waiting page with NotifyPage URL
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: `<script>var notifyUrl = 'https://identity.sieltecloud.it/simplesaml/module.php/notify/NotifyPage.php';</script>`,
        }),
      );
      // S5 (only 1 poll, maxPolls=1, same body → no change → timeout)
      fetchMock.mockResolvedValueOnce(mockResponse({ body: "<pending/>" }));

      await expect(
        timeoutClient.loginSpid(mockSpidCredentials),
      ).rejects.toThrow(AdeSpidTimeoutError);
    });

    it("throws AdePortalError when SPID entry point has no SAMLRequest form", async () => {
      // S1 returns HTML without SAMLRequest form
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: "<html><body>Error page</body></html>" }),
      );

      await expect(client.loginSpid(mockSpidCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("throws AdePortalError when IdP SSOService does not redirect (no Location)", async () => {
      // S1: valid SAML form
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: `<html><body>
            <form action="https://identity.sieltecloud.it/simplesaml/saml2/idp/SSOService.php" method="post">
              <input type="hidden" name="SAMLRequest" value="mock_saml" />
              <input type="hidden" name="RelayState" value="FeC" />
            </form>
          </body></html>`,
        }),
      );
      // S2: 200 instead of 303 — no Location header
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 200, body: "Error" }),
      );

      await expect(client.loginSpid(mockSpidCredentials)).rejects.toThrow(
        AdePortalError,
      );
    });

    it("throws AdeNetworkError on network failure during SPID flow", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(client.loginSpid(mockSpidCredentials)).rejects.toThrow(
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

      // Login usa 7 chiamate (Phases A-G), quindi submit è all'indice 7
      const submitCall = fetchMock.mock.calls[7];
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

    it("retries with re-auth on 401 (skip wizardTemplate, usa P.IVA nota)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // First attempt: 401
      fetchMock.mockResolvedValueOnce(mockResponse({ status: 401 }));

      // Re-auth: 6 chiamate (Phase F wizardTemplate skippata — pIva già nota)
      mockReAuthSequence(fetchMock);

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

      // Re-auth: 6 chiamate
      mockReAuthSequence(fetchMock);

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
        documentoCommerciale: {
          cfCessionarioCommittente: "",
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
          numeroProgressivo: "DCW2026/5111-2188",
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
        },
      };

      fetchMock.mockResolvedValueOnce(mockResponse({ body: mockDoc }));

      const result = await client.getDocument("151085589");

      // URL corretto: /documenti/{idtrx}/
      const call = fetchMock.mock.calls[7];
      expect(call[0]).toContain(
        "/ser/api/documenti/v1/doc/documenti/151085589/",
      );

      expect(result.idtrx).toBe("151085589");
      expect(
        result.documentoCommerciale.elementiContabili[0].idElementoContabile,
      ).toBe("270270040");
      expect(result.documentoCommerciale.totaleImponibile).toBe("10.00000000");
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
      const call = fetchMock.mock.calls[7];
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
      const call = fetchMock.mock.calls[7];
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
    it("chiama i due endpoint iampe (best-effort)", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      // 2 logout calls: GET /sam/UI/Logout + POST /api/logout
      fetchMock.mockResolvedValueOnce(mockResponse({}));
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await client.logout();

      // 7 login (Phases A-G) + 2 logout = 9 total
      expect(fetchMock).toHaveBeenCalledTimes(9);

      const logoutCall1 = fetchMock.mock.calls[7];
      expect(logoutCall1[0]).toContain(
        "iampe.agenziaentrate.gov.it/sam/UI/Logout",
      );

      const logoutCall2 = fetchMock.mock.calls[8];
      expect(logoutCall2[0]).toContain(
        "iampe.agenziaentrate.gov.it/api/logout",
      );
      expect(logoutCall2[1].method).toBe("POST");
    });

    it("does not throw if logout URLs fail", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockRejectedValueOnce(new Error("Network error"));
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.logout()).resolves.toBeUndefined();
    });

    it("clears session — operations throw after logout", async () => {
      mockLoginSequence(fetchMock);
      await client.login(mockCredentials);

      fetchMock.mockResolvedValueOnce(mockResponse({}));
      fetchMock.mockResolvedValueOnce(mockResponse({}));

      await client.logout();

      await expect(client.submitSale(makeSalePayload())).rejects.toThrow(
        "Not logged in",
      );
    });
  });
});
