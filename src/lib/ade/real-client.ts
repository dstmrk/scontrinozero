/**
 * RealAdeClient — HTTP client for the Agenzia delle Entrate portal.
 *
 * Implements the 6-phase Fisconline authentication flow and document
 * submission via direct HTTP calls (no headless browser).
 *
 * Reference: docs/api-spec.md
 * Flow verified against HAR capture: login_ade_fisconline.har
 */

import type { AdeClient, AdeSession } from "./client";
import type {
  AdeCedentePrestatore,
  AdePayload,
  AdeProduct,
  AdeResponse,
  FisconlineCredentials,
} from "./types";
import { CookieJar } from "./cookie-jar";
import {
  AdeAuthError,
  AdeNetworkError,
  AdePortalError,
  AdeSessionExpiredError,
} from "./errors";

const ADE_BASE_URL = "https://ivaservizi.agenziaentrate.gov.it";

/**
 * Headers required for POST document submission (api-spec.md sez. 2.4).
 * HAR fix (vendita.har): added Referer header sent by the browser.
 */
const SUBMIT_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json;charset=UTF-8",
  Origin: "https://ivaservizi.agenziaentrate.gov.it",
  Referer:
    "https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "deny",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=16070400; includeSubDomains",
};

export class RealAdeClient implements AdeClient {
  private session: AdeSession | null = null;
  private readonly cookieJar: CookieJar = new CookieJar();
  private credentials: FisconlineCredentials | null = null;

  // -----------------------------------------------------------------------
  // HTTP foundation
  // -----------------------------------------------------------------------

  /** Fetch wrapper that manages cookie jar and wraps network errors. */
  private async request(
    url: string,
    options?: RequestInit & { followRedirects?: boolean },
  ): Promise<Response> {
    const { followRedirects, ...fetchOptions } = options ?? {};

    const headers = new Headers(fetchOptions.headers);
    const cookieValue = this.cookieJar.toHeaderValue();
    if (cookieValue) {
      headers.set("Cookie", cookieValue);
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        redirect: followRedirects === false ? "manual" : "follow",
      });
      this.cookieJar.applyResponse(response);
      return response;
    } catch (err) {
      throw new AdeNetworkError(err);
    }
  }

  // -----------------------------------------------------------------------
  // Authentication phases (1-6)
  // -----------------------------------------------------------------------

  /**
   * Phase 1: Initialize cookie jar by loading the portal home page.
   *
   * HAR fix: use /portale/web/guest/home (not /portale/web/guest) to obtain
   * the correct initial cookies (JSESSIONID, etc.).
   */
  private async initCookieJar(): Promise<void> {
    await this.request(`${ADE_BASE_URL}/portale/web/guest/home`);
  }

  /**
   * Phase 2: Login with Fisconline credentials.
   *
   * HAR fixes (login_ade_fisconline.har):
   * - URL: p_p_col_pos=4, p_p_col_count=6 (old code had 3 and 4 → portal mismatch)
   * - Body: 4 required params were missing:
   *     _58_saveLastPath=false, _58_redirect=, _58_doActionAfterLogin=false, ricorda-cf=on
   *   Without them the portal did not establish an authenticated session and
   *   redirected in a loop, causing "redirect count exceeded" in Node.js fetch.
   * - Referer header added (sent by the browser in the HAR).
   * - Redirect chain is exactly 2 hops: POST → /portale/c/... → /portale/web/guest/home
   */
  private async postLogin(credentials: FisconlineCredentials): Promise<void> {
    const url =
      `${ADE_BASE_URL}/portale/home?p_p_id=58&p_p_lifecycle=1` +
      `&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1` +
      `&p_p_col_pos=4&p_p_col_count=6` +
      `&_58_struts_action=%2Flogin%2Flogin`;

    const body = new URLSearchParams({
      _58_saveLastPath: "false",
      _58_redirect: "",
      _58_doActionAfterLogin: "false",
      _58_login: credentials.codiceFiscale,
      _58_password: credentials.password,
      _58_pin: credentials.pin,
      "ricorda-cf": "on",
    });

    const response = await this.request(url, {
      method: "POST",
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${ADE_BASE_URL}/portale/web/guest/home`,
      },
      followRedirects: false,
    });

    const location = response.headers.get("Location") ?? "";

    // Successful login → portal returns 302 to /portale/c/<userId>/...
    if (!location.includes("/portale/c")) {
      throw new AdeAuthError(
        "Login failed: invalid credentials or account locked",
      );
    }

    // Follow the remaining redirect chain (ends at /portale/web/guest/home)
    const redirectUrl = location.startsWith("http")
      ? location
      : `${ADE_BASE_URL}${location}`;
    await this.request(redirectUrl);
  }

  /**
   * Phase 3: Extract Liferay p_auth token from the authenticated home page.
   *
   * HAR fix: /dp/api returns an EMPTY body (length 0) — cannot be used.
   * Liferay.authToken is embedded in the /portale/web/guest/home HTML
   * (verified at char position 11805 in the captured HAR response).
   */
  private async extractPAuth(): Promise<string> {
    const url = `${ADE_BASE_URL}/portale/web/guest/home`;
    const response = await this.request(url);
    const html = await response.text();

    const match = /Liferay\.authToken\s*=\s*['"]([^'"]+)['"]/.exec(html);
    if (!match?.[1]) {
      throw new AdePortalError(
        200,
        "Failed to extract p_auth token from portal home page",
      );
    }

    return match[1];
  }

  /**
   * Phase 4: Activate the portal session via the DatiOpzioni portlet.
   *
   * HAR fix: this POST is required before verifySession.
   * Without it: /ser/api/fatture/v1/ul/me/adesione/stato/ → 401
   * After it:   /ser/api/fatture/v1/ul/me/adesione/stato/ → 200
   * This step was completely absent from the old code.
   */
  private async activateSession(): Promise<void> {
    const url =
      `${ADE_BASE_URL}/portale/home` +
      `?p_p_id=DatiOpzioni_WAR_DatiOpzioniportlet` +
      `&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view` +
      `&p_p_cacheability=cacheLevelPage` +
      `&p_p_col_id=column-2&p_p_col_count=10`;

    const body = new URLSearchParams({
      _DatiOpzioni_WAR_DatiOpzioniportlet_reload: "false",
    });

    await this.request(url, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  /** Phase 5: Verify the session is active (ready probe). */
  private async verifySession(): Promise<void> {
    const url = `${ADE_BASE_URL}/ser/api/fatture/v1/ul/me/adesione/stato/`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Session verification failed with status ${response.status}`,
      );
    }
  }

  /**
   * Phase 6: Fetch the real Partita IVA from the portal.
   *
   * HAR fix: the old code derived P.IVA by slicing the codice fiscale
   * (codiceFiscale.slice(0, 11).padEnd(11, "0")) which is completely wrong —
   * a CF is not a P.IVA and slicing it produces garbage.
   * The real P.IVA is available at /ser/api/portale/v1/gestori/me/
   * in the JSON field: anagrafica.piva
   *
   * HAR note: selectEntity (scelta-utenza-lavoro) does NOT appear in the
   * captured flow — it is not needed for single-entity Fisconline accounts.
   */
  private async fetchPartitaIva(): Promise<string> {
    const url = `${ADE_BASE_URL}/ser/api/portale/v1/gestori/me/`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Failed to fetch gestori/me: status ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      anagrafica?: { piva?: string };
    };
    const piva = data?.anagrafica?.piva;

    if (!piva) {
      throw new AdePortalError(
        200,
        "Failed to extract Partita IVA from gestori/me response",
      );
    }

    return piva;
  }

  /** Full authentication flow (Phases 1-6). */
  private async authenticate(
    credentials: FisconlineCredentials,
  ): Promise<AdeSession> {
    await this.initCookieJar(); // Phase 1: seed cookies
    await this.postLogin(credentials); // Phase 2: login POST
    const pAuth = await this.extractPAuth(); // Phase 3: grab authToken
    await this.activateSession(); // Phase 4: DatiOpzioni (required)
    await this.verifySession(); // Phase 5: 200 probe
    const partitaIva = await this.fetchPartitaIva(); // Phase 6: real P.IVA

    return {
      pAuth,
      partitaIva,
      createdAt: Date.now(),
    };
  }

  // -----------------------------------------------------------------------
  // Public methods (AdeClient interface)
  // -----------------------------------------------------------------------

  async login(credentials: FisconlineCredentials): Promise<AdeSession> {
    this.credentials = credentials;
    this.cookieJar.clear();
    this.session = await this.authenticate(credentials);
    return this.session;
  }

  async submitSale(payload: AdePayload): Promise<AdeResponse> {
    return this.submitDocument(payload);
  }

  async submitVoid(payload: AdePayload): Promise<AdeResponse> {
    return this.submitDocument(payload);
  }

  async getFiscalData(): Promise<AdeCedentePrestatore> {
    this.assertLoggedIn();

    const url = `${ADE_BASE_URL}/ser/api/documenti/v1/doc/documenti/dati/fiscali`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Failed to fetch fiscal data: status ${response.status}`,
      );
    }

    return response.json();
  }

  /**
   * Recupera il catalogo prodotti dal portale AdE.
   *
   * HAR finding (vendita.har, request [02]):
   * GET /ser/api/documenti/v1/doc/rubrica/prodotti
   * Response: [{"descrizioneProdotto":"...","prezzoUnitario":"100","aliquotaIVA":"N2","id":438167,"prezzoLordo":"100"}]
   */
  async getProducts(): Promise<AdeProduct[]> {
    this.assertLoggedIn();

    const url = `${ADE_BASE_URL}/ser/api/documenti/v1/doc/rubrica/prodotti?v=${Date.now()}`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Failed to fetch product catalog: status ${response.status}`,
      );
    }

    return response.json() as Promise<AdeProduct[]>;
  }

  /**
   * Recupera l'HTML dello scontrino emesso.
   *
   * HAR finding (vendita.har, request [11]):
   * GET /ser/api/documenti/v1/doc/documenti/{idtrx}/stampa/?v=...&regalo=false
   * Chiamato dal portale subito dopo l'emissione per anteprima/stampa.
   */
  async getStampa(idtrx: string, isGift = false): Promise<string> {
    this.assertLoggedIn();

    const regalo = isGift ? "true" : "false";
    const url =
      `${ADE_BASE_URL}/ser/api/documenti/v1/doc/documenti/${idtrx}/stampa/` +
      `?v=${Date.now()}&regalo=${regalo}`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Failed to fetch stampa for idtrx ${idtrx}: status ${response.status}`,
      );
    }

    return response.text();
  }

  async logout(): Promise<void> {
    const logoutPaths = [
      "/cons/opt-services/logout",
      "/cons/cons-services/logout",
      "/cons/cons-other-services/logout",
      "/cons/mass-services/logout",
    ];

    for (const path of logoutPaths) {
      try {
        await this.request(`${ADE_BASE_URL}${path}`);
      } catch {
        // Best-effort, ignore failures
      }
    }

    try {
      await this.request(`${ADE_BASE_URL}/portale/c/portal/logout`);
    } catch {
      // Best-effort
    }

    this.session = null;
    this.credentials = null;
    this.cookieJar.clear();
  }

  // -----------------------------------------------------------------------
  // Document submission with 401 retry
  // -----------------------------------------------------------------------

  /** Submit a document (sale or void) with automatic 401 retry. */
  private async submitDocument(payload: AdePayload): Promise<AdeResponse> {
    this.assertLoggedIn();

    const url = `${ADE_BASE_URL}/ser/api/documenti/v1/doc/documenti/?v=${Date.now()}`;

    let response = await this.request(url, {
      method: "POST",
      headers: SUBMIT_HEADERS,
      body: JSON.stringify(payload),
    });

    // On 401: re-authenticate once and retry
    if (response.status === 401) {
      if (!this.credentials) {
        throw new AdeSessionExpiredError();
      }

      try {
        this.cookieJar.clear();
        this.session = await this.authenticate(this.credentials);
      } catch {
        throw new AdeSessionExpiredError();
      }

      response = await this.request(url, {
        method: "POST",
        headers: SUBMIT_HEADERS,
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        throw new AdeSessionExpiredError();
      }
    }

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Document submission failed with status ${response.status}`,
      );
    }

    return response.json();
  }

  private assertLoggedIn(): void {
    if (!this.session) {
      throw new Error("Not logged in. Call login() first.");
    }
  }
}
