/**
 * Custom error classes for the RealAdeClient.
 *
 * Typed errors allow callers to distinguish failure modes programmatically
 * (e.g., auth failure vs network error vs portal error).
 */

/** Base class for all AdE-related errors. */
export class AdeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AdeError";
    this.code = code;
  }
}

/** Authentication failed (wrong credentials or account locked). */
export class AdeAuthError extends AdeError {
  constructor(message: string = "Authentication failed") {
    super("ADE_AUTH_FAILED", message);
    this.name = "AdeAuthError";
  }
}

/**
 * Fisconline password expired — user must change it via the AdE portal.
 *
 * HAR finding (login_password_scaduta.har): POST /api/login/telematico
 * returns 401 with {"details":"PASSWORD_EXPIRED"} when the password has expired.
 * This is distinct from wrong credentials ({"details":"INVALID_CREDENTIALS"}).
 */
export class AdePasswordExpiredError extends AdeError {
  constructor() {
    super("ADE_PASSWORD_EXPIRED", "Password Fisconline scaduta");
    this.name = "AdePasswordExpiredError";
  }
}

/** Session expired, re-auth was attempted and also failed. */
export class AdeSessionExpiredError extends AdeError {
  constructor() {
    super("ADE_SESSION_EXPIRED", "Session expired and re-auth failed");
    this.name = "AdeSessionExpiredError";
  }
}

/** The AdE portal returned a non-200 status or unexpected response. */
export class AdePortalError extends AdeError {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super("ADE_PORTAL_ERROR", message);
    this.name = "AdePortalError";
    this.statusCode = statusCode;
  }
}

/**
 * L'invio del documento ha ricevuto un HTTP di successo (200) ma il body non è
 * JSON valido — pagina di manutenzione HTML servita con 200, risposta troncata,
 * proxy interposto. La POST è stata **consegnata**: il documento fiscale può
 * essere stato registrato su AdE o no → l'esito è **ignoto**, non una failure
 * definitiva.
 *
 * Perché una classe dedicata e non un `AdePortalError`: marcare la riga ERROR
 * la farebbe uscire dall'indice unique parziale su `voided_document_id` e dalla
 * riconciliazione pre-resubmit, aprendo la porta a un doppio annullo / doppia
 * emissione (documento fiscale duplicato, irreversibile). Per questo
 * `isTransientAdeError` la riconosce: significato del predicato = "esito non
 * determinabile → non marcare ERROR, lascia PENDING". La stale recovery
 * riconcilia contro AdE via `searchDocuments` prima di qualunque re-submit.
 *
 * Mai includere il body nel messaggio: contiene dati fiscali (importi, CF).
 */
export class AdeUnknownOutcomeError extends AdeError {
  readonly statusCode: number;
  readonly contentType: string | null;

  constructor(statusCode: number, contentType: string | null) {
    super(
      "ADE_UNKNOWN_OUTCOME",
      `Document submission returned status ${statusCode} with a non-JSON body (content-type: ${contentType ?? "unknown"})`,
    );
    this.name = "AdeUnknownOutcomeError";
    this.statusCode = statusCode;
    this.contentType = contentType;
  }
}

/** Network-level error (DNS, timeout, connection refused). */
export class AdeNetworkError extends AdeError {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    const msg = cause instanceof Error ? cause.message : "Network error";
    super("ADE_NETWORK_ERROR", msg);
    this.name = "AdeNetworkError";
    this.cause = cause;
  }
}

/**
 * La sessione AdE per un metodo interattivo (CIE/SPID) è assente o scaduta e
 * non può essere ri-creata in autonomia dal server (il secondo fattore è
 * un'azione umana: push/OTP). L'emissione/annullo la traduce in
 * `{ reauthRequired: true }` così la UI chiede all'utente di ri-collegarsi.
 * Distinta da `AdeSessionExpiredError` (Fisconline, dove il re-login silenzioso
 * è possibile e il suo fallimento è un errore vero).
 */
export class AdeReauthRequiredError extends AdeError {
  readonly method: string;

  constructor(method: string) {
    super(
      "ADE_REAUTH_REQUIRED",
      `Interactive re-authentication required (${method})`,
    );
    this.name = "AdeReauthRequiredError";
    this.method = method;
  }
}

/**
 * SPID push notification not confirmed within the polling window.
 *
 * HAR finding (login_spid.har): the mobile app must approve the login
 * request before the session can be established. If the user doesn't
 * respond in time, this error is raised.
 */
export class AdeSpidTimeoutError extends AdeError {
  constructor(maxPolls: number) {
    super(
      "ADE_SPID_TIMEOUT",
      `SPID push notification not approved after ${maxPolls} polls`,
    );
    this.name = "AdeSpidTimeoutError";
  }
}
