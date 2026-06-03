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

describe("AdeError (base)", () => {
  it("stores the provided code and message", () => {
    const err = new AdeError("CUSTOM_CODE", "boom");
    expect(err.code).toBe("CUSTOM_CODE");
    expect(err.message).toBe("boom");
    expect(err.name).toBe("AdeError");
  });

  it("is an instance of Error", () => {
    expect(new AdeError("X", "y")).toBeInstanceOf(Error);
  });
});

describe("AdeAuthError", () => {
  it("uses the default message when none is given", () => {
    const err = new AdeAuthError();
    expect(err.code).toBe("ADE_AUTH_FAILED");
    expect(err.message).toBe("Authentication failed");
    expect(err.name).toBe("AdeAuthError");
  });

  it("accepts an overridden message while keeping the code", () => {
    const err = new AdeAuthError("account locked");
    expect(err.message).toBe("account locked");
    expect(err.code).toBe("ADE_AUTH_FAILED");
  });

  it("is an instance of AdeError", () => {
    expect(new AdeAuthError()).toBeInstanceOf(AdeError);
  });
});

describe("AdePasswordExpiredError", () => {
  it("has the fixed code and Italian message", () => {
    const err = new AdePasswordExpiredError();
    expect(err.code).toBe("ADE_PASSWORD_EXPIRED");
    expect(err.message).toBe("Password Fisconline scaduta");
    expect(err.name).toBe("AdePasswordExpiredError");
    expect(err).toBeInstanceOf(AdeError);
  });
});

describe("AdeSessionExpiredError", () => {
  it("has the fixed code and message", () => {
    const err = new AdeSessionExpiredError();
    expect(err.code).toBe("ADE_SESSION_EXPIRED");
    expect(err.message).toBe("Session expired and re-auth failed");
    expect(err.name).toBe("AdeSessionExpiredError");
  });
});

describe("AdePortalError", () => {
  it("stores the HTTP status code alongside the message", () => {
    const err = new AdePortalError(502, "bad gateway");
    expect(err.statusCode).toBe(502);
    expect(err.message).toBe("bad gateway");
    expect(err.code).toBe("ADE_PORTAL_ERROR");
    expect(err.name).toBe("AdePortalError");
  });
});

describe("AdeNetworkError", () => {
  it("derives the message from an Error cause and exposes the cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new AdeNetworkError(cause);
    expect(err.message).toBe("ECONNREFUSED");
    expect(err.cause).toBe(cause);
    expect(err.code).toBe("ADE_NETWORK_ERROR");
    expect(err.name).toBe("AdeNetworkError");
  });

  it("falls back to a generic message for a non-Error cause", () => {
    const err = new AdeNetworkError("just a string");
    expect(err.message).toBe("Network error");
    expect(err.cause).toBe("just a string");
  });
});

describe("AdeSpidTimeoutError", () => {
  it("interpolates the poll count into the message", () => {
    const err = new AdeSpidTimeoutError(12);
    expect(err.message).toBe(
      "SPID push notification not approved after 12 polls",
    );
    expect(err.code).toBe("ADE_SPID_TIMEOUT");
    expect(err.name).toBe("AdeSpidTimeoutError");
  });
});
