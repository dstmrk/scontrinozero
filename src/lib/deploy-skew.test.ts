import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

// `unstable_isUnrecognizedActionError` di Next è un `instanceof`: in un test
// non possiamo costruire un'istanza che condivida l'identità della classe col
// modulo caricato dal sorgente, quindi lo pilotiamo e verifichiamo entrambe le
// vie del predicato (delega a Next + fallback sul nome).
const mockIsUnrecognizedActionError = vi.fn<(error: unknown) => boolean>();

vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: (error: unknown) =>
    mockIsUnrecognizedActionError(error),
}));

import {
  DEPLOY_SKEW_RELOAD_COOLDOWN_MS,
  isDeploySkewError,
  recoverFromDeploySkew,
} from "./deploy-skew";

// ─── Stub di `location` ───────────────────────────────────────────────────
// `location.reload` di jsdom non è sostituibile con `vi.spyOn` (proprietà non
// configurabile): rimpiazziamo l'oggetto intero e lo ripristiniamo dopo.

const realLocation = globalThis.location;
const mockReload = vi.fn<() => void>();

beforeEach(() => {
  vi.clearAllMocks();
  mockIsUnrecognizedActionError.mockReturnValue(false);
  sessionStorage.clear();
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...realLocation, reload: mockReload },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: realLocation,
  });
});

describe("isDeploySkewError", () => {
  it("delega a Next: se il suo predicato ufficiale dice skew, è skew", () => {
    mockIsUnrecognizedActionError.mockReturnValue(true);
    const error = new Error("qualunque cosa");

    expect(isDeploySkewError(error)).toBe(true);
    expect(mockIsUnrecognizedActionError).toHaveBeenCalledWith(error);
  });

  it("riconosce l'errore per nome, com'è dopo la minificazione del bundle", () => {
    // `UnrecognizedActionError` assegna `name` come stringa letterale nel
    // costruttore: è il solo tratto che sopravvive al build di produzione.
    const error = Object.assign(
      new Error('Server Action "40da6925" was not found on the server.'),
      { name: "UnrecognizedActionError" },
    );

    expect(isDeploySkewError(error)).toBe(true);
  });

  it("NON scambia per skew un errore applicativo qualsiasi", () => {
    expect(isDeploySkewError(new Error("boom"))).toBe(false);
  });

  it("NON scambia per skew un errore server con solo il digest", () => {
    expect(
      isDeploySkewError(Object.assign(new Error(), { digest: "d1" })),
    ).toBe(false);
  });

  it("regge i valori non-Error che React può passare al boundary", () => {
    expect(isDeploySkewError(null)).toBe(false);
    expect(isDeploySkewError("UnrecognizedActionError")).toBe(false);
    expect(isDeploySkewError({ name: "UnrecognizedActionError" })).toBe(false);
  });
});

describe("recoverFromDeploySkew", () => {
  it("ricarica la pagina al primo skew della scheda", () => {
    const started = recoverFromDeploySkew(1_000_000);

    expect(started).toBe(true);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("NON rimbalza l'utente una seconda volta dentro la finestra di guardia", () => {
    recoverFromDeploySkew(1_000_000);
    mockReload.mockClear();

    const started = recoverFromDeploySkew(
      1_000_000 + DEPLOY_SKEW_RELOAD_COOLDOWN_MS - 1,
    );

    expect(started).toBe(false);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("torna a ricaricare oltre la finestra: una scheda aperta a lungo vede più release", () => {
    recoverFromDeploySkew(1_000_000);
    mockReload.mockClear();

    const started = recoverFromDeploySkew(
      1_000_000 + DEPLOY_SKEW_RELOAD_COOLDOWN_MS,
    );

    expect(started).toBe(true);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("marca il tentativo in sessionStorage, che è ciò che sopravvive al reload", () => {
    recoverFromDeploySkew(1_234_567);

    expect(sessionStorage.getItem("sz.deploy-skew-reload-at")).toBe("1234567");
  });

  it("ricarica comunque se lo storage è bloccato: il marcatore è un freno, non un requisito", () => {
    // Storage negato (privacy mode, webview): `safeSessionStorage` degrada a
    // null/no-op. Senza marcatore non c'è loop possibile — l'errore riparte
    // solo da una nuova azione dell'utente, mai dal caricamento della pagina.
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });

    expect(recoverFromDeploySkew(1_000_000)).toBe(true);
    expect(mockReload).toHaveBeenCalledTimes(1);

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("ignora un marcatore illeggibile invece di bloccare il recupero", () => {
    sessionStorage.setItem("sz.deploy-skew-reload-at", "non-un-numero");

    expect(recoverFromDeploySkew(1_000_000)).toBe(true);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
