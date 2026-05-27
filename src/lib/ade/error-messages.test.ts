import { describe, expect, it } from "vitest";

import {
  AdeAuthError,
  AdeError,
  AdeNetworkError,
  AdePasswordExpiredError,
  AdePortalError,
  AdeSessionExpiredError,
  AdeSpidTimeoutError,
} from "./errors";
import { getUserFacingAdeErrorMessage } from "./error-messages";

const FALLBACK = "Operazione fallita. Riprova.";

describe("getUserFacingAdeErrorMessage", () => {
  it("returns the password-expired message with passwordExpired flag", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdePasswordExpiredError(),
      FALLBACK,
    );
    expect(result.message).toBe("La password Fisconline è scaduta.");
    expect(result.passwordExpired).toBe(true);
  });

  it("returns the credentials message for AdeAuthError", () => {
    const result = getUserFacingAdeErrorMessage(new AdeAuthError(), FALLBACK);
    expect(result.message).toBe(
      "Credenziali Fisconline non valide. Verifica codice fiscale, password e PIN.",
    );
    expect(result.passwordExpired).toBeUndefined();
  });

  it("returns the network message for AdeNetworkError", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdeNetworkError(new Error("ECONNRESET")),
      FALLBACK,
    );
    expect(result.message).toBe(
      "Il portale Agenzia delle Entrate non è raggiungibile in questo momento. Riprova fra qualche minuto.",
    );
  });

  it("returns the portal-down message for AdePortalError with 5xx", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdePortalError(500, "wizardTemplate failed with status 500"),
      FALLBACK,
    );
    expect(result.message).toBe(
      "Il portale Agenzia delle Entrate ha un problema temporaneo (codice 500). Non dipende dalle tue credenziali, riprova fra qualche minuto.",
    );
  });

  it("includes the specific status code (503) in the portal-down message", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdePortalError(503, "setUserChoice failed with status 503"),
      FALLBACK,
    );
    expect(result.message).toContain("codice 503");
  });

  it("returns the fallback for AdePortalError with non-5xx status", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdePortalError(302, "Redirect Location is malformed"),
      FALLBACK,
    );
    expect(result.message).toBe(FALLBACK);
  });

  it("returns the SPID timeout message for AdeSpidTimeoutError", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdeSpidTimeoutError(30),
      FALLBACK,
    );
    expect(result.message).toBe(
      "Non hai approvato la richiesta SPID in tempo. Riprova.",
    );
  });

  it("returns the fallback for AdeSessionExpiredError", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdeSessionExpiredError(),
      FALLBACK,
    );
    expect(result.message).toBe(FALLBACK);
  });

  it("returns the fallback for a generic AdeError", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdeError("ADE_UNKNOWN", "something unexpected"),
      FALLBACK,
    );
    expect(result.message).toBe(FALLBACK);
  });

  it("returns the fallback for a non-Ade Error", () => {
    const result = getUserFacingAdeErrorMessage(
      new Error("totally unrelated"),
      FALLBACK,
    );
    expect(result.message).toBe(FALLBACK);
  });

  it("returns the fallback for a non-Error value", () => {
    const result = getUserFacingAdeErrorMessage("oops", FALLBACK);
    expect(result.message).toBe(FALLBACK);
  });
});
