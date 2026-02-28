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
  AdeDocumentDetail,
  AdeDocumentList,
  AdePayload,
  AdeProduct,
  AdeResponse,
  AdeSearchParams,
  FisconlineCredentials,
  SpidCredentials,
} from "./types";
import { CookieJar } from "./cookie-jar";
import {
  AdeAuthError,
  AdeNetworkError,
  AdePortalError,
  AdeSessionExpiredError,
  AdeSpidTimeoutError,
} from "./errors";

/** Opzioni costruttore per RealAdeClient */
export interface RealAdeClientOptions {
  /** Intervallo di polling push notification SPID in ms (default: 7000). 0 in test. */
  spidPollIntervalMs?: number;
  /** Numero massimo di poll SPID prima del timeout (default: 30). */
  spidMaxPolls?: number;
}

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

  constructor(private readonly options: RealAdeClientOptions = {}) {}

  // -----------------------------------------------------------------------
  // HTTP foundation
  // -----------------------------------------------------------------------

  /**
   * Fetch wrapper that manages a cookie jar and wraps network errors.
   *
   * @param jar - Cookie jar to use. Defaults to this.cookieJar (AdE portal).
   *              Pass a separate jar for IdP requests (SPID flow) to avoid
   *              mixing AdE cookies with IdP-domain cookies.
   */
  private async request(
    url: string,
    options?: RequestInit & { followRedirects?: boolean },
    jar?: CookieJar,
  ): Promise<Response> {
    const cookieJar = jar ?? this.cookieJar;
    const { followRedirects, ...fetchOptions } = options ?? {};

    const headers = new Headers(fetchOptions.headers);
    const cookieValue = cookieJar.toHeaderValue();
    if (cookieValue) {
      headers.set("Cookie", cookieValue);
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        redirect: followRedirects === false ? "manual" : "follow",
      });
      cookieJar.applyResponse(response);
      return response;
    } catch (err) {
      throw new AdeNetworkError(err);
    }
  }

  /**
   * Follow an HTTP redirect chain manually, capturing cookies at each hop.
   *
   * Problem: Node.js fetch with redirect:'follow' follows all hops internally
   * without giving us access to intermediate responses. If the portal sets
   * session cookies in an intermediate redirect response, those cookies are
   * missed → our cookie jar is incomplete → subsequent hops look
   * unauthenticated → portal redirects to login again → circular loop →
   * "redirect count exceeded" (undici limit: 20 hops).
   *
   * Solution: follow each hop via redirect:'manual' so that request() calls
   * applyResponse() on every single response, keeping the cookie jar in sync
   * with what a browser would accumulate.
   *
   * HAR note: the Phase 2 redirect chain (POST login → /portale/c/... →
   * /portale/web/guest/home) exhibits exactly this behaviour.
   */
  private async followRedirectChain(
    startUrl: string,
    maxHops = 20,
    jar?: CookieJar,
  ): Promise<Response> {
    let url = startUrl;
    let hops = 0;

    while (hops < maxHops) {
      const response = await this.request(url, { followRedirects: false }, jar);

      // Success (2xx) or server error: stop following
      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      // Redirect: resolve Location and continue
      const location = response.headers.get("Location");
      if (!location) return response;

      url = location.startsWith("http")
        ? location
        : `${ADE_BASE_URL}${location}`;
      hops++;
    }

    throw new AdePortalError(302, `Redirect chain exceeded ${maxHops} hops`);
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

    // Follow the remaining redirect chain (ends at /portale/web/guest/home).
    // IMPORTANT: must use followRedirectChain (not request) so that cookies
    // from each intermediate redirect hop are captured in the jar.
    // Using request() with redirect:'follow' misses intermediate Set-Cookie
    // headers, leaving the jar incomplete and causing a redirect loop.
    const redirectUrl = location.startsWith("http")
      ? location
      : `${ADE_BASE_URL}${location}`;
    await this.followRedirectChain(redirectUrl);
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
   * Phase 3b: Initialize the IBM DataPower cross-domain session.
   *
   * HAR fix (login_ade_fisconline.har entry 45): the portal page JS fires a
   * GET /dp/api?v=<timestamp> call on every authenticated page load. This is
   * NOT a data-fetching call (the response body is empty) — it is a
   * DataPower session initialization ping. Without it, ALL /ser/api/*
   * endpoints return 401 because DataPower has not established the
   * backend session token for the current Liferay session cookies.
   *
   * HAR evidence:
   *   entry 45: GET /dp/api?v=1740420665617  → 200 (empty body)
   *   entry 46: GET /ser/api/.../stato/      → 401 (races with dp/api)
   *   entry 48: GET /ser/api/.../stato/      → 200 (after dp/api completes)
   *
   * The previous code extracted Liferay.authToken from /dp/api — that was
   * wrong; /dp/api returns an empty body. The authToken is in the home page
   * HTML (Phase 3). But the /dp/api call itself is still required here.
   */
  private async initDataPowerSession(): Promise<void> {
    await this.request(`${ADE_BASE_URL}/dp/api?v=${Date.now()}`);
  }

  /**
   * Phase 4: Activate the portal session via the DatiOpzioni portlet.
   *
   * HAR fix (login_ade_fisconline.har entry 47): POST fires after dp/api
   * and before the second adesione/stato call. While dp/api is the critical
   * step for /ser/api/* auth, DatiOpzioni is also called by the portal JS
   * on every page load and may set additional session state.
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
   * HAR fix (login_ade_fisconline.har): the old code derived P.IVA by slicing
   * the codice fiscale (codiceFiscale.slice(0, 11).padEnd(11, "0")) which is
   * completely wrong — a CF is not a P.IVA and slicing it produces garbage.
   * The real P.IVA is available at /ser/api/portale/v1/gestori/me/
   * in the JSON field: anagrafica.piva
   *
   * HAR finding (login_spid.har [163]): gestori/me returns 404 for SPID users
   * (they are not "gestori" in AdE's sense). Fallback: fetch P.IVA from
   * /ser/api/documenti/v1/doc/documenti/dati/fiscali (same endpoint used by
   * getFiscalData()) → identificativiFiscali.partitaIva
   *
   * HAR note: selectEntity (scelta-utenza-lavoro) does NOT appear in the
   * captured flow — it is not needed for single-entity Fisconline accounts.
   */
  private async fetchPartitaIva(): Promise<string> {
    const url = `${ADE_BASE_URL}/ser/api/portale/v1/gestori/me/`;
    const response = await this.request(url);

    // SPID users get 404 from gestori/me → use dati/fiscali fallback
    if (response.status === 404) {
      return this.fetchPartitaIvaFromFiscali();
    }

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

  /**
   * Fallback P.IVA fetch for SPID users (gestori/me returns 404).
   *
   * HAR finding (login_spid.har): SPID users must obtain P.IVA from
   * dati/fiscali (the same endpoint used by getFiscalData()).
   * Field: identificativiFiscali.partitaIva
   */
  private async fetchPartitaIvaFromFiscali(): Promise<string> {
    const url = `${ADE_BASE_URL}/ser/api/documenti/v1/doc/documenti/dati/fiscali`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Failed to fetch dati/fiscali for P.IVA: status ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      identificativiFiscali?: { partitaIva?: string };
    };
    const piva = data?.identificativiFiscali?.partitaIva;

    if (!piva) {
      throw new AdePortalError(
        200,
        "Failed to extract Partita IVA from dati/fiscali response",
      );
    }

    return piva;
  }

  /** Full Fisconline authentication flow (Phases 1-6). */
  private async authenticate(
    credentials: FisconlineCredentials,
  ): Promise<AdeSession> {
    await this.initCookieJar(); // Phase 1: seed cookies
    await this.postLogin(credentials); // Phase 2: login POST + redirect chain
    const pAuth = await this.extractPAuth(); // Phase 3: grab authToken
    await this.initDataPowerSession(); // Phase 3b: DataPower ping (REQUIRED before /ser/api/*)
    await this.activateSession(); // Phase 4: DatiOpzioni portlet
    await this.verifySession(); // Phase 5: 200 probe
    const partitaIva = await this.fetchPartitaIva(); // Phase 6: real P.IVA (404→dati/fiscali)

    return {
      pAuth,
      partitaIva,
      createdAt: Date.now(),
    };
  }

  // -----------------------------------------------------------------------
  // SPID authentication helpers (HAR: login_spid.har)
  // -----------------------------------------------------------------------

  /**
   * Parse a hidden input value from HTML by name attribute.
   * Handles both name-first and value-first attribute orderings.
   */
  private parseHiddenInput(html: string, name: string): string | null {
    const safePattern = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameFirst = new RegExp(
      `name=["']${safePattern}["'][^>]*?value=["']([^"']*)["']`,
      "is",
    );
    const valueFirst = new RegExp(
      `value=["']([^"']*)["'][^>]*?name=["']${safePattern}["']`,
      "is",
    );
    return (nameFirst.exec(html) ?? valueFirst.exec(html))?.[1] ?? null;
  }

  /** Parse form action URL from HTML. */
  private parseFormAction(html: string): string | null {
    return /<form[^>]+action=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
  }

  /**
   * S1: GET AdE SP entry point for SPID → HTML form with SAMLRequest.
   *
   * HAR finding (login_spid.har [30]):
   *   GET /dp/SPID/{provider}/s4 → HTML auto-submit form with SAMLRequest,
   *   RelayState="FeC", action=IdP SSOService URL.
   */
  private async spidFetchSamlRequest(provider: string): Promise<{
    ssoUrl: string;
    samlRequest: string;
    relayState: string;
  }> {
    const url = `${ADE_BASE_URL}/dp/SPID/${provider}/s4`;
    const response = await this.request(url);
    const html = await response.text();

    const ssoUrl = this.parseFormAction(html);
    const samlRequest = this.parseHiddenInput(html, "SAMLRequest");
    const relayState = this.parseHiddenInput(html, "RelayState");

    if (!ssoUrl || !samlRequest || !relayState) {
      throw new AdePortalError(
        200,
        "Failed to parse SAMLRequest form from SPID entry point",
      );
    }

    return { ssoUrl, samlRequest, relayState };
  }

  /**
   * S2: POST SAMLRequest to IdP SSOService → 303 → loginform.php?AuthState=...
   *
   * HAR finding (login_spid.har [31]):
   *   POST https://identity.sieltecloud.it/simplesaml/saml2/idp/SSOService.php
   *   Body: SAMLRequest=...&RelayState=FeC
   *   Response: 303, Location: .../loginuserpass.php?AuthState=_xyz
   */
  private async spidPostToIdp(
    ssoUrl: string,
    samlRequest: string,
    relayState: string,
    idpJar: CookieJar,
  ): Promise<{ loginformUrl: string; authState: string }> {
    const body = new URLSearchParams({
      SAMLRequest: samlRequest,
      RelayState: relayState,
    });

    const response = await this.request(
      ssoUrl,
      {
        method: "POST",
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        followRedirects: false,
      },
      idpJar,
    );

    const location = response.headers.get("Location") ?? "";
    if (!location) {
      throw new AdePortalError(
        response.status,
        "SPID: no redirect from IdP SSOService after SAMLRequest POST",
      );
    }

    // Extract AuthState from the redirect URL
    const authStateMatch = /[?&]AuthState=([^&]+)/.exec(location);
    if (!authStateMatch) {
      throw new AdePortalError(
        response.status,
        "SPID: AuthState not found in loginform redirect Location",
      );
    }

    const loginformUrl = location.startsWith("http")
      ? location
      : `${new URL(ssoUrl).origin}${location}`;

    return {
      loginformUrl,
      authState: decodeURIComponent(authStateMatch[1]),
    };
  }

  /**
   * S3: GET loginform to seed IdP session cookies.
   *
   * HAR finding (login_spid.har [32]):
   *   GET loginuserpass.php?AuthState=... → 200 (login form)
   */
  private async spidGetLoginForm(
    loginformUrl: string,
    idpJar: CookieJar,
  ): Promise<void> {
    await this.request(loginformUrl, {}, idpJar);
  }

  /**
   * S4: POST user credentials to loginform.
   *
   * HAR finding (login_spid.har [52]):
   *   POST loginuserpass.php
   *   Body: cancel=false, username=CF, password=PWD, AuthState=...
   *   Response: 200 (2FA method choice page)
   */
  private async spidPostCredentials(
    loginformUrl: string,
    credentials: SpidCredentials,
    authState: string,
    idpJar: CookieJar,
  ): Promise<void> {
    const body = new URLSearchParams({
      cancel: "false",
      username: credentials.codiceFiscale,
      password: credentials.password,
      AuthState: authState,
    });

    await this.request(
      loginformUrl,
      {
        method: "POST",
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
      idpJar,
    );
  }

  /**
   * S4b: Select push notification 2FA method → waiting page.
   * Returns the NotifyPage URL parsed from the waiting page HTML.
   *
   * HAR finding (login_spid.har [72]):
   *   POST loginuserpass.php
   *   Body: cancel=false, switch=, username=CF, useapp=, usenotify=true, AuthState=...
   *   Response: 200 (waiting for push notification page, contains NotifyPage URL)
   */
  private async spidSelectPushNotify(
    loginformUrl: string,
    credentials: SpidCredentials,
    authState: string,
    idpJar: CookieJar,
  ): Promise<string> {
    const body = new URLSearchParams({
      cancel: "false",
      switch: "",
      username: credentials.codiceFiscale,
      useapp: "",
      usenotify: "true",
      AuthState: authState,
    });

    const response = await this.request(
      loginformUrl,
      {
        method: "POST",
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
      idpJar,
    );

    const html = await response.text();

    // Try to extract NotifyPage URL from the waiting page HTML
    const notifyMatch = /['"]([^'"]*NotifyPage[^'"]*)['"]/i.exec(html);
    if (notifyMatch) {
      const notifyPath = notifyMatch[1];
      if (notifyPath.startsWith("http")) return notifyPath;

      const idpBase = new URL(loginformUrl).origin;
      return `${idpBase}${notifyPath.startsWith("/") ? "" : "/"}${notifyPath}`;
    }

    // Fallback: construct from IdP base + SimpleSAMLphp convention
    const idpBase = new URL(loginformUrl).origin;
    return `${idpBase}/simplesaml/module.php/notify/NotifyPage.php`;
  }

  /**
   * S5: Poll NotifyPage until push notification is approved (body changes).
   *
   * HAR finding (login_spid.har [94-96]):
   *   POST NotifyPage.php, header X-Requested-With: XMLHttpRequest
   *   Body: AuthState=...
   *   Responses: 200, ~50 bytes (pending) → 200, ~57 bytes (approved)
   *   Detection: response body changes from baseline → notification approved.
   */
  private async spidPollNotify(
    notifyUrl: string,
    authState: string,
    idpJar: CookieJar,
  ): Promise<void> {
    const maxPolls = this.options.spidMaxPolls ?? 30;
    const intervalMs = this.options.spidPollIntervalMs ?? 7000;
    let pendingBody: string | null = null;

    for (let i = 0; i < maxPolls; i++) {
      const body = new URLSearchParams({ AuthState: authState });

      const response = await this.request(
        notifyUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: body.toString(),
        },
        idpJar,
      );

      const responseBody = await response.text();

      if (pendingBody === null) {
        // First poll: record the "pending" baseline
        pendingBody = responseBody;
      } else if (responseBody !== pendingBody) {
        // Body changed → push notification approved
        return;
      }

      if (i < maxPolls - 1 && intervalMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    throw new AdeSpidTimeoutError(maxPolls);
  }

  /**
   * S6: POST accedi=1 to loginform after push approval → 303 → accept.php.
   * Returns the accept.php URL from the Location header.
   *
   * HAR finding (login_spid.har [97]):
   *   POST loginuserpass.php
   *   Body: cancel=false, password=, switch=, username=CF, newNotify=,
   *         useapp=, accedi=1, AuthState=...
   *   Response: 303, Location: .../accept.php?AuthState=...
   */
  private async spidPostAccedi(
    loginformUrl: string,
    credentials: SpidCredentials,
    authState: string,
    idpJar: CookieJar,
  ): Promise<string> {
    const body = new URLSearchParams({
      cancel: "false",
      password: "",
      switch: "",
      username: credentials.codiceFiscale,
      newNotify: "",
      useapp: "",
      accedi: "1",
      AuthState: authState,
    });

    const response = await this.request(
      loginformUrl,
      {
        method: "POST",
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        followRedirects: false,
      },
      idpJar,
    );

    const location = response.headers.get("Location") ?? "";
    if (!location) {
      throw new AdePortalError(
        response.status,
        "SPID: no redirect from loginform after accedi=1",
      );
    }

    return location.startsWith("http")
      ? location
      : `${new URL(loginformUrl).origin}${location}`;
  }

  /**
   * S7: GET accept.php (consent page).
   *
   * HAR finding (login_spid.har [98]):
   *   GET accept.php?AuthState=... → 200 (consent page)
   */
  private async spidGetAccept(
    acceptUrl: string,
    idpJar: CookieJar,
  ): Promise<void> {
    await this.request(acceptUrl, {}, idpJar);
  }

  /**
   * S8: POST accept=true → IdP returns SAMLResponse HTML auto-submit form.
   *
   * HAR finding (login_spid.har [114]):
   *   POST accept.php
   *   Body: accept=true, AuthState=...
   *   Response: 200, HTML form with SAMLResponse + RelayState targeting AdE /dp/SPID
   */
  private async spidPostAccept(
    acceptUrl: string,
    authState: string,
    idpJar: CookieJar,
  ): Promise<{ samlResponse: string; relayState: string; formAction: string }> {
    const body = new URLSearchParams({ accept: "true", AuthState: authState });

    const response = await this.request(
      acceptUrl,
      {
        method: "POST",
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
      idpJar,
    );

    const html = await response.text();
    const samlResponse = this.parseHiddenInput(html, "SAMLResponse");
    const relayState = this.parseHiddenInput(html, "RelayState");
    const formAction = this.parseFormAction(html) ?? `${ADE_BASE_URL}/dp/SPID`;

    if (!samlResponse || !relayState) {
      throw new AdePortalError(
        200,
        "SPID: failed to parse SAMLResponse from accept.php response",
      );
    }

    return { samlResponse, relayState, formAction };
  }

  /**
   * S9: POST SAMLResponse to AdE SP → 302 → follow redirect chain to portal.
   *
   * HAR finding (login_spid.har [116-118]):
   *   POST /dp/SPID (SAMLResponse, RelayState=FeC) → 302 → /portale/ →
   *   302 → /portale/web/guest/home → 200 (authenticated)
   */
  private async spidPostSamlResponse(
    samlResponse: string,
    relayState: string,
    formAction: string,
  ): Promise<void> {
    const body = new URLSearchParams({
      SAMLResponse: samlResponse,
      RelayState: relayState,
    });

    const response = await this.request(formAction, {
      method: "POST",
      body: body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      followRedirects: false,
    });

    const location = response.headers.get("Location") ?? "";
    if (!location) {
      throw new AdePortalError(
        response.status,
        "SPID: no redirect from AdE SP after SAMLResponse POST",
      );
    }

    const redirectUrl = location.startsWith("http")
      ? location
      : `${ADE_BASE_URL}${location}`;

    await this.followRedirectChain(redirectUrl);
  }

  /** Full SPID authentication flow (S1-S15). */
  private async authenticateSpid(
    credentials: SpidCredentials,
  ): Promise<AdeSession> {
    // S1: Get SAML request form from AdE SP
    const { ssoUrl, samlRequest, relayState } = await this.spidFetchSamlRequest(
      credentials.spidProvider,
    );

    const idpJar = new CookieJar();

    // S2: POST SAMLRequest to IdP → loginform URL + AuthState
    const { loginformUrl, authState } = await this.spidPostToIdp(
      ssoUrl,
      samlRequest,
      relayState,
      idpJar,
    );

    // S3: GET loginform (seeds IdP cookies)
    await this.spidGetLoginForm(loginformUrl, idpJar);

    // S4: POST credentials
    await this.spidPostCredentials(
      loginformUrl,
      credentials,
      authState,
      idpJar,
    );

    // S4b: POST usenotify=true → get NotifyPage URL
    const notifyUrl = await this.spidSelectPushNotify(
      loginformUrl,
      credentials,
      authState,
      idpJar,
    );

    // S5: Poll NotifyPage until push approved
    await this.spidPollNotify(notifyUrl, authState, idpJar);

    // S6: POST accedi=1 → accept.php URL
    const acceptUrl = await this.spidPostAccedi(
      loginformUrl,
      credentials,
      authState,
      idpJar,
    );

    // S7: GET accept.php (consent page)
    await this.spidGetAccept(acceptUrl, idpJar);

    // S8: POST accept=true → SAMLResponse
    const {
      samlResponse,
      relayState: returnRelayState,
      formAction,
    } = await this.spidPostAccept(acceptUrl, authState, idpJar);

    // S9: POST SAMLResponse to AdE SP → follow redirect to portal
    await this.spidPostSamlResponse(samlResponse, returnRelayState, formAction);

    // S10-S14: Same post-auth phases as Fisconline
    const pAuth = await this.extractPAuth(); // S11
    await this.initDataPowerSession(); // S12
    await this.activateSession(); // S13
    await this.verifySession(); // S14
    const partitaIva = await this.fetchPartitaIva(); // S15 (404→dati/fiscali for SPID)

    return { pAuth, partitaIva, createdAt: Date.now() };
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

  async loginSpid(credentials: SpidCredentials): Promise<AdeSession> {
    // SPID sessions don't store credentials: no automatic re-auth on 401
    // (user would need to approve the push notification again)
    this.credentials = null;
    this.cookieJar.clear();
    this.session = await this.authenticateSpid(credentials);
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

  /**
   * Recupera il dettaglio di un documento tramite id transazione.
   *
   * HAR finding (annullo.har [05]): chiamato prima dell'annullo per ottenere
   * elementiContabili (con idElementoContabile reali) e totali monetari.
   */
  async getDocument(idtrx: string): Promise<AdeDocumentDetail> {
    this.assertLoggedIn();

    const url = `${ADE_BASE_URL}/ser/api/documenti/v1/doc/documenti/${idtrx}/`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Failed to fetch document ${idtrx}: status ${response.status}`,
      );
    }

    return response.json() as Promise<AdeDocumentDetail>;
  }

  /**
   * Ricerca documenti commerciali con filtri opzionali.
   *
   * HAR finding (annullo.har [03], [04]):
   *   GET /ser/api/documenti/v1/doc/documenti/?dataDal=MM%2FDD%2FYYYY&dataInvioAl=...
   *   GET /ser/api/documenti/v1/doc/documenti/?numeroProgressivo=...&tipoOperazione=V
   */
  async searchDocuments(params: AdeSearchParams): Promise<AdeDocumentList> {
    this.assertLoggedIn();

    const qs = new URLSearchParams();
    if (params.dataDal) qs.set("dataDal", params.dataDal);
    if (params.dataInvioAl) qs.set("dataInvioAl", params.dataInvioAl);
    if (params.numeroProgressivo)
      qs.set("numeroProgressivo", params.numeroProgressivo);
    if (params.tipoOperazione) qs.set("tipoOperazione", params.tipoOperazione);
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.perPage !== undefined) qs.set("perPage", String(params.perPage));

    const url = `${ADE_BASE_URL}/ser/api/documenti/v1/doc/documenti/?${qs.toString()}`;
    const response = await this.request(url);

    if (!response.ok) {
      throw new AdePortalError(
        response.status,
        `Failed to search documents: status ${response.status}`,
      );
    }

    return response.json() as Promise<AdeDocumentList>;
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
