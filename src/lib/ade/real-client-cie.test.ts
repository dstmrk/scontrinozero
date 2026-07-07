/**
 * @vitest-environment node
 *
 * CIE authentication flow (HAR: login_cie_ok_notifica_app.har,
 * login_cie_ko_credenziali_non_valide.har).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RealAdeClient } from "./real-client";
import { AdeAuthError, AdeSpidTimeoutError } from "./errors";
import type { CieCredentials } from "./types";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function mockResponse(opts: {
  status?: number;
  body?: string | object;
  headers?: [string, string][];
  location?: string;
}): Response {
  const { status = 200, body = "", headers = [], location } = opts;
  const responseHeaders: [string, string][] = [...headers];
  if (location) responseHeaders.push(["Location", location]);
  const responseBody = typeof body === "object" ? JSON.stringify(body) : body;
  return new Response(responseBody, { status, headers: responseHeaders });
}

const IDP = "https://idserver.servizicie.interno.gov.it";
const SP = "https://sp.agenziaentrate.gov.it";
const IAMPE = "https://iampe.agenziaentrate.gov.it";
const PORTALE = "https://portale.agenziaentrate.gov.it";

/** HTML form auto-submit SAML (action + SAMLRequest/SAMLResponse + RelayState). */
function samlForm(action: string, field: string, relayState: string): string {
  return `<form action="${action}" method="post">
    <input type="hidden" name="${field}" value="ABC123" />
    <input type="hidden" name="RelayState" value="${relayState}" />
  </form>`;
}

// KO livello2: pagina ri-renderizzata col messaggio esatto dell'IdP CIE
// (login_cie_ko_credenziali_non_valide.har).
const CIE_LOGIN_PAGE = `<!DOCTYPE html><html><head><title>CIE Login</title></head>
  <body><form action="/idp/login/livello2" method="post">
  <div class="row mb-4 mx-n2 error"> Credenziali non valide.</div>
  <input name="username" class="form-control error" />
  <input name="password" type="password" class="form-control input-password error " />
  </form></body></html>`;

const CREDENTIALS: CieCredentials = {
  username: "mario.rossi@example.com",
  password: "cie-password",
};

/**
 * Queue the full CIE happy-path fetch sequence (23 request() calls).
 * push approvato: il body di checkpush cambia dal baseline al secondo poll.
 */
function mockCieHappyPath(fetchMock: ReturnType<typeof vi.fn>): void {
  // 1. GET /rp/cie/sel → form verso l'IdP
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: samlForm(
        `${IDP}/idp/profile/SAML2/POST/SSO`,
        "SAMLRequest",
        "selcie",
      ),
    }),
  );
  // 2a. POST IdP SSO → 302 probe e1s1
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 302,
      location: `${IDP}/idp/profile/SAML2/POST/SSO?execution=e1s1`,
    }),
  );
  // 2b. GET e1s1 → 200 probe page
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 3a. POST probe1 → 302 livello2
  fetchMock.mockResolvedValueOnce(
    mockResponse({ status: 302, location: `${IDP}/idp/login/livello2?opId=X` }),
  );
  // 3b. GET livello2 → 200 credentials page
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 4. POST credentials → 200 (waiting page, no error markers)
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 5a. checkpush baseline
  fetchMock.mockResolvedValueOnce(mockResponse({ body: "PENDING" }));
  // 5b. checkpush approved (body changed)
  fetchMock.mockResolvedValueOnce(mockResponse({ body: "APPROVED" }));
  // 5c. GET postpush → 302 consent e1s4
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 302,
      location: `${IDP}/idp/profile/SAML2/POST/SSO?execution=e1s4`,
    }),
  );
  // 5d. GET e1s4 → 200 consent page
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 6a. POST consent → 302 e1s5
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 302,
      location: `${IDP}/idp/profile/SAML2/POST/SSO?execution=e1s5`,
    }),
  );
  // 6b. GET e1s5 → 200 final probe page
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 7. POST final probe → 200 SAMLResponse form verso AdE SP
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: samlForm(
        `${SP}/sp/AssertionConsumerService7`,
        "SAMLResponse",
        "selcie",
      ),
    }),
  );
  // 8a. POST ACS → 302 make4SAM
  fetchMock.mockResolvedValueOnce(
    mockResponse({ status: 302, location: `${SP}/make4SAM` }),
  );
  // 8b. GET make4SAM → 200 form verso iampe
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: samlForm(
        `${IAMPE}/sam/Consumer/metaAlias/agenziaentrate/age-sp`,
        "SAMLResponse",
        `${PORTALE}/PortaleWeb/home`,
      ),
    }),
  );
  // 8c. POST iampe Consumer → 302 portale home
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      status: 302,
      location: `${PORTALE}/PortaleWeb/home?to=FATBTB`,
    }),
  );
  // 8d. GET portale home → 200
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 9a. initPortale → 501
  fetchMock.mockResolvedValueOnce(mockResponse({ status: 501 }));
  // 9b. InstradamentofcWeb/home → 200
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 9c. initLight → x-appl header
  fetchMock.mockResolvedValueOnce(
    mockResponse({ headers: [["x-appl", "tok"]] }),
  );
  // 9d. dp/PI2FC → 200
  fetchMock.mockResolvedValueOnce(mockResponse({}));
  // 9e. wizardTemplate → PIva + cfUidUltimo
  fetchMock.mockResolvedValueOnce(
    mockResponse({
      body: {
        PIva: [{ piva: "10872631006", denominazione: "DE STEFANO MARCO" }],
        cfUidUltimo: "DSTMRC86T02H501V",
      },
    }),
  );
  // 9f. setUserChoice → 200
  fetchMock.mockResolvedValueOnce(mockResponse({}));
}

describe("RealAdeClient.loginCie", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("completes the CIE flow and extracts P.IVA + CF from wizardTemplate", async () => {
    mockCieHappyPath(fetchMock);
    const client = new RealAdeClient({ spidPollIntervalMs: 0 });

    const session = await client.loginCie(CREDENTIALS);

    expect(session.partitaIva).toBe("10872631006");

    // setUserChoice deve usare il CF letto da cfUidUltimo (non lo username email).
    const calls = fetchMock.mock.calls;
    const setUserChoiceCall = calls.find(([url]) =>
      String(url).includes("/setUserChoice"),
    );
    expect(setUserChoiceCall).toBeDefined();
    const body = JSON.parse(String(setUserChoiceCall![1].body));
    expect(body.cf).toBe("DSTMRC86T02H501V");
    expect(body.pIva).toBe("10872631006");
  });

  it("posts CIE credentials to the livello2 endpoint", async () => {
    mockCieHappyPath(fetchMock);
    const client = new RealAdeClient({ spidPollIntervalMs: 0 });

    await client.loginCie(CREDENTIALS);

    const livello2Post = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/idp/login/livello2") &&
        (init as RequestInit)?.method === "POST",
    );
    expect(livello2Post).toBeDefined();
    const bodyStr = String((livello2Post![1] as RequestInit).body);
    expect(bodyStr).toContain("username=mario.rossi");
    expect(bodyStr).toContain("password=cie-password");
  });

  it("throws AdeAuthError when livello2 re-renders the login page (wrong credentials)", async () => {
    // 1. sel, 2a POST SSO, 2b probe, 3a POST probe→livello2, 3b GET livello2,
    // 4. POST credentials → login page ri-renderizzata (KO)
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        body: samlForm(
          `${IDP}/idp/profile/SAML2/POST/SSO`,
          "SAMLRequest",
          "selcie",
        ),
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 302,
        location: `${IDP}/idp/profile/SAML2/POST/SSO?execution=e1s1`,
      }),
    );
    fetchMock.mockResolvedValueOnce(mockResponse({}));
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 302,
        location: `${IDP}/idp/login/livello2?opId=X`,
      }),
    );
    fetchMock.mockResolvedValueOnce(mockResponse({}));
    fetchMock.mockResolvedValueOnce(mockResponse({ body: CIE_LOGIN_PAGE }));

    const client = new RealAdeClient({ spidPollIntervalMs: 0 });
    await expect(client.loginCie(CREDENTIALS)).rejects.toThrow(AdeAuthError);
  });

  it("throws AdeSpidTimeoutError when the push is never approved", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        body: samlForm(
          `${IDP}/idp/profile/SAML2/POST/SSO`,
          "SAMLRequest",
          "selcie",
        ),
      }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 302,
        location: `${IDP}/idp/profile/SAML2/POST/SSO?execution=e1s1`,
      }),
    );
    fetchMock.mockResolvedValueOnce(mockResponse({}));
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 302,
        location: `${IDP}/idp/login/livello2?opId=X`,
      }),
    );
    fetchMock.mockResolvedValueOnce(mockResponse({}));
    fetchMock.mockResolvedValueOnce(mockResponse({})); // credentials OK
    // checkpush: body sempre uguale → mai approvato
    for (let i = 0; i < 5; i++) {
      fetchMock.mockResolvedValueOnce(mockResponse({ body: "PENDING" }));
    }

    const client = new RealAdeClient({
      spidPollIntervalMs: 0,
      spidMaxPolls: 3,
    });
    await expect(client.loginCie(CREDENTIALS)).rejects.toThrow(
      AdeSpidTimeoutError,
    );
  });
});
