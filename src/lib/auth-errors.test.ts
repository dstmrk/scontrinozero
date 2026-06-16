import { describe, it, expect, vi, beforeEach } from "vitest";
import { authErrorResult, UnauthenticatedError } from "./auth-errors";
import { logger } from "@/lib/logger";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("UnauthenticatedError", () => {
  it("è un Error con message 'Not authenticated' e name dedicato", () => {
    const err = new UnauthenticatedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Not authenticated");
    expect(err.name).toBe("UnauthenticatedError");
  });
});

describe("authErrorResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ritorna 'Non autenticato.' senza loggare su UnauthenticatedError", () => {
    const result = authErrorResult(new UnauthenticatedError(), "testAction");

    expect(result).toEqual({ error: "Non autenticato." });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("degrada e logga error su un errore inatteso", () => {
    const dbError = new Error("connection timeout");
    const result = authErrorResult(dbError, "testAction");

    expect(result).toEqual({
      error: "Servizio temporaneamente non disponibile. Riprova.",
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, action: "testAction" },
      "authentication check failed unexpectedly",
    );
  });

  it("degrada anche su valori non-Error (es. throw di stringa)", () => {
    const result = authErrorResult("boom", "testAction");

    expect(result).toEqual({
      error: "Servizio temporaneamente non disponibile. Riprova.",
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
