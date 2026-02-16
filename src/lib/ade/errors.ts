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
