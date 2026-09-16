import type { AdeUtenzaCandidate } from "./types";

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

/**
 * L'utenza AdE ha fatto login correttamente ma non ha **nessuna partita IVA**
 * su cui operare: `wizardTemplate` (Fisconline/CIE) o `dati/fiscali` /
 * `gestori/me` (SPID) rispondono `200` con un body valido in cui la P.IVA non
 * c'è.
 *
 * Perché una classe dedicata e non `AdePortalError(200, ...)`: il portale non
 * è guasto, ha risposto quello che doveva. La causa sta nell'utenza —
 * `isExpectedUserAdeError` la riconosce e la manda a `warn`, fuori da Sentry
 * (regola 20). Prima era un `ade_failure`: SCONTRINOZERO-13 apriva una issue
 * per ogni tentativo mentre l'utente vedeva "Controlla le credenziali" e le
 * riscriveva — quattro volte in quaranta secondi, con credenziali già corrette.
 *
 * Payload osservato in produzione (nessuna chiave `PIva`, solo le altre
 * personae del wizard): `cfUidUltimo`, `hasDelega`, `intermediario`,
 * `richiestaIncarichi`, `soloPerMe`, `tutore`. Accade quando la P.IVA è
 * intestata a un soggetto diverso dalla persona che accede — società, studio,
 * delega a intermediario. `setUserChoice` invia sempre
 * `tipoutenza: "meStesso"`, quindi quei casi non sono supportati: REVIEW.md #106.
 *
 * `source` è l'endpoint che ha risposto senza P.IVA, per distinguere i tre
 * percorsi nei log. Mai includere CF, P.IVA o denominazione nel messaggio.
 */
export class AdeNoPartitaIvaError extends AdeError {
  readonly source: string;

  constructor(source: string) {
    super(
      "ADE_NO_PARTITA_IVA",
      `No Partita IVA available for this AdE account (source: ${source})`,
    );
    this.name = "AdeNoPartitaIvaError";
    this.source = source;
  }
}

/**
 * Il login è riuscito e delle partite IVA ci sono, ma quale usare non è
 * determinabile da soli: o ce n'è più d'una, o l'unica strada passa da un
 * incarico per conto di un altro soggetto (HAR.md #18).
 *
 * Perché anche con **un solo** incarico: la scelta diventa immutabile alla
 * prima verifica riuscita, quindi legare un account a una società senza che
 * nessuno l'abbia confermato è un errore che si ripara solo aprendo un altro
 * account. Il portale stesso chiede sempre.
 *
 * Distinta da `AdeNoPartitaIvaError`, che vale quando non c'è proprio niente da
 * scegliere. `candidates` trasporta la lista perché è quello che serve a chi
 * dovrà mostrarla: la classe è il punto di aggancio del picker.
 */
export class AdeUtenzaSelectionRequiredError extends AdeError {
  readonly candidates: AdeUtenzaCandidate[];

  constructor(candidates: AdeUtenzaCandidate[]) {
    super(
      "ADE_UTENZA_SELECTION_REQUIRED",
      `AdE account can operate on ${candidates.length} VAT number(s): one must be selected`,
    );
    this.name = "AdeUtenzaSelectionRequiredError";
    this.candidates = candidates;
  }
}

/**
 * L'utenza di lavoro scelta in passato non è più fra quelle che il portale offre
 * oggi: incarico revocato, società cessata, o una P.IVA che non è mai stata di
 * questo accesso.
 *
 * È una condizione **permanente** finché qualcuno non rimette a posto le
 * abilitazioni sul portale AdE — nessun retry la risolve — e non è un guasto
 * nostro: `isExpectedUserAdeError` la manda a `warn`, fuori da Sentry.
 */
export class AdeUtenzaNotAvailableError extends AdeError {
  readonly piva: string;

  constructor(piva: string) {
    super(
      "ADE_UTENZA_NOT_AVAILABLE",
      "The selected working identity is no longer offered by the AdE portal",
    );
    this.name = "AdeUtenzaNotAvailableError";
    this.piva = piva;
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
