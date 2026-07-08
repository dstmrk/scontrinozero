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
import {
  getUserFacingAdeErrorMessage,
  isExpectedUserAdeError,
  isTransientAdeError,
} from "./error-messages";

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
      "Il portale Agenzia delle Entrate Fatture e Corrispettivi non è raggiungibile al momento. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    );
  });

  it("returns the portal-down message for AdePortalError with 5xx", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdePortalError(500, "wizardTemplate failed with status 500"),
      FALLBACK,
    );
    expect(result.message).toBe(
      "Il portale Agenzia delle Entrate Fatture e Corrispettivi non risponde al momento. Non dipende da te né da ScontrinoZero. Riprova tra qualche minuto.",
    );
  });

  it("returns the same portal-down message regardless of the specific 5xx code", () => {
    const result = getUserFacingAdeErrorMessage(
      new AdePortalError(503, "setUserChoice failed with status 503"),
      FALLBACK,
    );
    expect(result.message).toContain("non risponde al momento");
    expect(result.message).not.toContain("503");
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

  describe("method-aware messages (CIE)", () => {
    it("returns the CIE credentials message for AdeAuthError with method cie", () => {
      const result = getUserFacingAdeErrorMessage(
        new AdeAuthError(),
        FALLBACK,
        "cie",
      );
      expect(result.message).toBe(
        "Credenziali CIE ID non valide. Verifica email e password.",
      );
    });

    it("returns the CIE push message for AdeSpidTimeoutError with method cie", () => {
      const result = getUserFacingAdeErrorMessage(
        new AdeSpidTimeoutError(12),
        FALLBACK,
        "cie",
      );
      expect(result.message).toBe(
        "Non hai approvato la notifica sull'app CIE ID in tempo. Riprova.",
      );
    });

    it("keeps the Fisconline credentials message with method fisconline", () => {
      const result = getUserFacingAdeErrorMessage(
        new AdeAuthError(),
        FALLBACK,
        "fisconline",
      );
      expect(result.message).toBe(
        "Credenziali Fisconline non valide. Verifica codice fiscale, password e PIN.",
      );
    });

    it("keeps the SPID message with method fisconline", () => {
      const result = getUserFacingAdeErrorMessage(
        new AdeSpidTimeoutError(30),
        FALLBACK,
        "fisconline",
      );
      expect(result.message).toBe(
        "Non hai approvato la richiesta SPID in tempo. Riprova.",
      );
    });
  });
});

describe("isTransientAdeError", () => {
  it("returns true for AdeNetworkError", () => {
    expect(
      isTransientAdeError(new AdeNetworkError(new Error("ECONNRESET"))),
    ).toBe(true);
  });

  it("returns true for AdeSpidTimeoutError", () => {
    expect(isTransientAdeError(new AdeSpidTimeoutError(30))).toBe(true);
  });

  it("returns true for AdePortalError with 5xx status", () => {
    expect(isTransientAdeError(new AdePortalError(500, "boom"))).toBe(true);
    expect(isTransientAdeError(new AdePortalError(503, "boom"))).toBe(true);
    expect(isTransientAdeError(new AdePortalError(599, "boom"))).toBe(true);
  });

  it("returns false for AdePortalError with 4xx status (permanent: bad input)", () => {
    expect(isTransientAdeError(new AdePortalError(400, "bad request"))).toBe(
      false,
    );
    expect(isTransientAdeError(new AdePortalError(404, "not found"))).toBe(
      false,
    );
  });

  it("returns false for AdePortalError with 3xx status (redirect malformed)", () => {
    expect(isTransientAdeError(new AdePortalError(302, "redirect"))).toBe(
      false,
    );
  });

  it("returns false for AdeAuthError (permanent: wrong credentials)", () => {
    expect(isTransientAdeError(new AdeAuthError())).toBe(false);
  });

  it("returns false for AdePasswordExpiredError (permanent: user action required)", () => {
    expect(isTransientAdeError(new AdePasswordExpiredError())).toBe(false);
  });

  it("returns false for AdeSessionExpiredError", () => {
    expect(isTransientAdeError(new AdeSessionExpiredError())).toBe(false);
  });

  it("returns false for a generic AdeError", () => {
    expect(isTransientAdeError(new AdeError("ADE_UNKNOWN", "boom"))).toBe(
      false,
    );
  });

  it("returns false for a non-Ade Error", () => {
    expect(isTransientAdeError(new Error("unrelated"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isTransientAdeError("oops")).toBe(false);
    expect(isTransientAdeError(null)).toBe(false);
    expect(isTransientAdeError(undefined)).toBe(false);
  });
});

describe("isExpectedUserAdeError", () => {
  it("returns true for AdeAuthError (wrong credentials are user input, not a bug)", () => {
    expect(isExpectedUserAdeError(new AdeAuthError())).toBe(true);
  });

  it("returns true for AdePasswordExpiredError (user must rotate password on portal)", () => {
    expect(isExpectedUserAdeError(new AdePasswordExpiredError())).toBe(true);
  });

  it("returns false for AdeNetworkError (transient, not user-actionable input)", () => {
    expect(
      isExpectedUserAdeError(new AdeNetworkError(new Error("ECONNRESET"))),
    ).toBe(false);
  });

  it("returns false for AdePortalError (upstream failure, not user input)", () => {
    expect(isExpectedUserAdeError(new AdePortalError(500, "boom"))).toBe(false);
    expect(isExpectedUserAdeError(new AdePortalError(400, "bad"))).toBe(false);
  });

  it("returns false for AdeSpidTimeoutError (transient, retry path)", () => {
    expect(isExpectedUserAdeError(new AdeSpidTimeoutError(30))).toBe(false);
  });

  it("returns false for AdeSessionExpiredError (internal state, not user input)", () => {
    expect(isExpectedUserAdeError(new AdeSessionExpiredError())).toBe(false);
  });

  it("returns false for a generic AdeError", () => {
    expect(isExpectedUserAdeError(new AdeError("ADE_UNKNOWN", "boom"))).toBe(
      false,
    );
  });

  it("returns false for a non-Ade Error", () => {
    expect(isExpectedUserAdeError(new Error("unrelated"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isExpectedUserAdeError("oops")).toBe(false);
    expect(isExpectedUserAdeError(null)).toBe(false);
    expect(isExpectedUserAdeError(undefined)).toBe(false);
  });
});
