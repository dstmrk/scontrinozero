import { describe, expect, it, vi } from "vitest";
import {
  AdeAuthError,
  AdeError,
  AdeNetworkError,
  AdeNoPartitaIvaError,
  AdePasswordExpiredError,
  AdePortalError,
  AdeSessionExpiredError,
  AdeSpidTimeoutError,
  AdeUnknownOutcomeError,
  AdeUtenzaNotAvailableError,
  AdeUtenzaSelectionRequiredError,
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

describe("AdeUnknownOutcomeError", () => {
  it("stores the status code and content type", () => {
    const err = new AdeUnknownOutcomeError(200, "text/html; charset=UTF-8");
    expect(err.statusCode).toBe(200);
    expect(err.contentType).toBe("text/html; charset=UTF-8");
    expect(err.code).toBe("ADE_UNKNOWN_OUTCOME");
    expect(err.name).toBe("AdeUnknownOutcomeError");
    expect(err).toBeInstanceOf(AdeError);
  });

  it("mentions the status and content type in the message but never the body", () => {
    const err = new AdeUnknownOutcomeError(200, "text/html");
    expect(err.message).toContain("200");
    expect(err.message).toContain("text/html");
  });

  it("tolerates a null content type", () => {
    const err = new AdeUnknownOutcomeError(200, null);
    expect(err.contentType).toBeNull();
    expect(err.message).toContain("unknown");
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

describe("AdeNoPartitaIvaError", () => {
  it("carries the fixed code and the source endpoint", () => {
    const err = new AdeNoPartitaIvaError("wizardTemplate");
    expect(err.code).toBe("ADE_NO_PARTITA_IVA");
    expect(err.name).toBe("AdeNoPartitaIvaError");
    expect(err.source).toBe("wizardTemplate");
    expect(err.message).toContain("wizardTemplate");
    expect(err).toBeInstanceOf(AdeError);
  });

  it("is NOT an AdePortalError: la response è un 200 valido, non un guasto", () => {
    expect(new AdeNoPartitaIvaError("dati/fiscali")).not.toBeInstanceOf(
      AdePortalError,
    );
  });
});

describe("AdeUtenzaSelectionRequiredError", () => {
  it("trasporta i candidati da mostrare e li conta nel messaggio", () => {
    const err = new AdeUtenzaSelectionRequiredError([
      {
        piva: "11111111111",
        denominazione: "ACME SRL",
        provenienza: "diretta" as const,
      },
      { piva: "22222222222", provenienza: "incarico" as const },
    ]);
    expect(err.code).toBe("ADE_UTENZA_SELECTION_REQUIRED");
    expect(err.name).toBe("AdeUtenzaSelectionRequiredError");
    expect(err.candidates).toHaveLength(2);
    expect(err.message).toContain("2");
    expect(err).toBeInstanceOf(AdeError);
  });
});

describe("AdeUtenzaNotAvailableError", () => {
  it("espone la P.IVA non più disponibile senza metterla nel messaggio", () => {
    const err = new AdeUtenzaNotAvailableError("12345678901");
    expect(err.code).toBe("ADE_UTENZA_NOT_AVAILABLE");
    expect(err.name).toBe("AdeUtenzaNotAvailableError");
    expect(err.piva).toBe("12345678901");
    // Il messaggio finisce nei log: niente identificativi fiscali dentro.
    expect(err.message).not.toContain("12345678901");
    expect(err).toBeInstanceOf(AdeError);
  });
});

/**
 * Turbopack compila le server action nel layer `action-browser` e le route nel
 * layer `rsc`: `errors.ts` diventa due moduli, quindi due copie di ogni classe
 * nello stesso processo (`src/lib/process-singleton.ts`). La cache di sessione
 * AdE è condivisa fra i due layer, quindi un errore costruito con le classi di
 * un layer arriva agli `instanceof` dell'altro. In produzione (10/11/2026) un
 * `AdeAuthError` sulla Developer API è stato classificato `ade_failure`:
 * messaggio "Riprova più tardi" al client e issue Sentry (SCONTRINOZERO-M).
 *
 * `vi.resetModules()` + import dinamico riproduce le due copie.
 */
describe("instanceof fra copie diverse del modulo", () => {
  type ErrorsModule = typeof import("./errors");

  async function freshCopy(): Promise<ErrorsModule> {
    vi.resetModules();
    return import("./errors");
  }

  it("le due copie sono davvero classi distinte (il test misura qualcosa)", async () => {
    const a = await freshCopy();
    const b = await freshCopy();
    expect(a.AdeAuthError).not.toBe(b.AdeAuthError);
    expect(
      Function.prototype[Symbol.hasInstance].call(
        b.AdeAuthError,
        new a.AdeAuthError(),
      ),
    ).toBe(false);
  });

  it("un errore dell'altra copia è instanceof della propria classe e di AdeError", async () => {
    const a = await freshCopy();
    const b = await freshCopy();
    const err = new a.AdeAuthError("Login failed: invalid credentials");
    expect(err).toBeInstanceOf(b.AdeAuthError);
    expect(err).toBeInstanceOf(b.AdeError);
    expect(err).toBeInstanceOf(Error);
  });

  it("non è instanceof di un'altra sottoclasse dell'altra copia", async () => {
    const a = await freshCopy();
    const b = await freshCopy();
    expect(new a.AdeAuthError()).not.toBeInstanceOf(b.AdePasswordExpiredError);
    expect(new a.AdeNoPartitaIvaError("x")).not.toBeInstanceOf(
      b.AdePortalError,
    );
  });

  it("un AdeError grezzo dell'altra copia è AdeError ma nessuna sottoclasse, anche con un codice di sottoclasse", async () => {
    const a = await freshCopy();
    const b = await freshCopy();
    const raw = new a.AdeError("ADE_AUTH_FAILED", "costruito a mano");
    expect(raw).toBeInstanceOf(b.AdeError);
    expect(raw).not.toBeInstanceOf(b.AdeAuthError);
  });

  it("i campi propri della sottoclasse restano leggibili dopo il narrowing", async () => {
    const a = await freshCopy();
    const b = await freshCopy();
    const err: unknown = new a.AdePortalError(503, "down");
    expect(err instanceof b.AdePortalError && err.statusCode).toBe(503);
  });

  it("valori che non sono errori AdE non passano", async () => {
    const b = await freshCopy();
    const lookalike = Object.assign(new Error("x"), {
      name: "AdeAuthError",
      code: "ADE_AUTH_FAILED",
    });
    expect(lookalike).not.toBeInstanceOf(b.AdeAuthError);
    expect(lookalike).not.toBeInstanceOf(b.AdeError);
    for (const value of [null, undefined, "AdeAuthError", 42, {}]) {
      expect(value).not.toBeInstanceOf(b.AdeError);
      expect(value).not.toBeInstanceOf(b.AdeAuthError);
    }
  });
});

describe("identità delle classi d'errore", () => {
  it("ogni sottoclasse dichiara un proprio codice statico, unico, uguale a quello delle istanze", async () => {
    const mod = await import("./errors");
    const subclasses = Object.values(mod).filter(
      (v): v is typeof mod.AdeError =>
        typeof v === "function" &&
        v !== mod.AdeError &&
        v.prototype instanceof mod.AdeError,
    );
    expect(subclasses.length).toBeGreaterThanOrEqual(12);

    const codes = subclasses.map((cls) => {
      // Senza codice proprio una sottoclasse erediterebbe `undefined` dalla
      // base e, fra copie, accetterebbe qualunque errore AdE.
      expect(Object.hasOwn(cls, "code"), cls.name).toBe(true);
      expect(typeof cls.code, cls.name).toBe("string");
      return cls.code;
    });
    expect(new Set(codes).size).toBe(codes.length);

    expect(new mod.AdeAuthError().code).toBe(mod.AdeAuthError.code);
    expect(new mod.AdePasswordExpiredError().code).toBe(
      mod.AdePasswordExpiredError.code,
    );
    expect(new mod.AdePortalError(500, "x").code).toBe(mod.AdePortalError.code);
  });
});
