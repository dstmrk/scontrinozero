/**
 * RealAdeClient — HTTP client for the Agenzia delle Entrate portal.
 *
 * Implements the 6-phase Fisconline authentication flow and document
 * submission via direct HTTP calls (no headless browser).
 *
 * Reference: docs/api-spec.md
 */

import type { AdeClient, AdeSession } from "./client";
import type {
  AdeCedentePrestatore,
  AdePayload,
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

/** Headers required for POST document submission (api-spec.md sez. 2.4). */
const SUBMIT_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json;charset=UTF-8",
  Origin: "https://ivaservizi.agenziaentrate.gov.it",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36",
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
  // Authentication phases (1-5)
  // -----------------------------------------------------------------------

  /** Phase 1: Initialize cookie jar with portal cookies. */
  private async initCookieJar(): Promise<void> {
    await this.request(`${ADE_BASE_URL}/portale/web/guest`);
  }

  /** Phase 2: Login with Fisconline credentials. */
  private async postLogin(credentials: FisconlineCredentials): Promise<void> {
    const url =
      `${ADE_BASE_URL}/portale/home?p_p_id=58&p_p_lifecycle=1` +
      `&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1` +
      `&p_p_col_pos=3&p_p_col_count=4` +
      `&_58_struts_action=%2Flogin%2Flogin`;

    const body = new URLSearchParams({
      _58_login: credentials.codiceFiscale,
      _58_password: credentials.password,
      _58_pin: credentials.pin,
    });

    const response = await this.request(url, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      followRedirects: false,
    });

    const location = response.headers.get("Location") ?? "";

    if (!location.includes("/portale/c")) {
      throw new AdeAuthError(
        "Login failed: invalid credentials or account locked",
      );
    }

    // Follow the redirect to collect session cookies
    const redirectUrl = location.startsWith("http")
      ? location
      : `${ADE_BASE_URL}${location}`;
    await this.request(redirectUrl);
  }

  /** Phase 3: Extract Liferay p_auth token from bootstrap page. */
  private async extractPAuth(): Promise<string> {
    const url = `${ADE_BASE_URL}/dp/api?v=${Date.now()}`;
    const response = await this.request(url);
    const html = await response.text();

    const match = /Liferay\.authToken\s*=\s*"([^"]+)"/.exec(html);
    if (!match?.[1]) {
      throw new AdePortalError(
        200,
        "Failed to extract p_auth token from bootstrap page",
      );
    }

    return match[1];
  }

  /** Phase 4: Select the working entity (Partita IVA). */
  private async selectEntity(pAuth: string, partitaIva: string): Promise<void> {
    const url =
      `${ADE_BASE_URL}/portale/scelta-utenza-lavoro?p_auth=${pAuth}` +
      `&p_p_id=SceltaUtenzaLavoro_WAR_SceltaUtenzaLavoroportlet` +
      `&p_p_lifecycle=1&p_p_state=normal&p_p_mode=view&p_p_col_id=column-1` +
      `&p_p_col_count=1` +
      `&_SceltaUtenzaLavoro_WAR_SceltaUtenzaLavoroportlet_javax.portlet.action=incarichiAction`;

    const body = new URLSearchParams({
      sceltaincarico: partitaIva,
      tipoincaricante: "ME",
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

  /** Full authentication flow (Phases 1-5). */
  private async authenticate(
    credentials: FisconlineCredentials,
  ): Promise<AdeSession> {
    await this.initCookieJar();
    await this.postLogin(credentials);
    const pAuth = await this.extractPAuth();

    // PoC: derive P.IVA from CF (same as MockAdeClient).
    // In Phase 3B the real P.IVA will come from user profile.
    const partitaIva = credentials.codiceFiscale.slice(0, 11).padEnd(11, "0");
    await this.selectEntity(pAuth, partitaIva);
    await this.verifySession();

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
