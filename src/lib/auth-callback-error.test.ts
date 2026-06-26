import { describe, it, expect } from "vitest";
import { mapAuthCallbackError } from "./auth-callback-error";

describe("mapAuthCallbackError", () => {
  it("returns the reset-specific message for reset_link_invalid", () => {
    const msg = mapAuthCallbackError("reset_link_invalid");
    expect(msg).toMatch(/reimpostare la password/i);
    expect(msg).toMatch(/scaduto|già stato usato/i);
  });

  it("returns the generic message for auth_callback_failed", () => {
    const msg = mapAuthCallbackError("auth_callback_failed");
    expect(msg).toMatch(/verificare il link/i);
  });

  it("returns null for an unknown code", () => {
    expect(mapAuthCallbackError("something_else")).toBeNull();
  });

  it("returns null when no code is present", () => {
    expect(mapAuthCallbackError(null)).toBeNull();
  });
});
