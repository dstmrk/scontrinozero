// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetchAdePrerequisites,
  mockToAdeSessionParams,
  mockIsCieSessionMissing,
} = vi.hoisted(() => ({
  mockFetchAdePrerequisites: vi.fn(),
  mockToAdeSessionParams: vi.fn(),
  mockIsCieSessionMissing: vi.fn(),
}));

vi.mock("@/lib/server-auth", () => ({
  fetchAdePrerequisites: mockFetchAdePrerequisites,
  toAdeSessionParams: mockToAdeSessionParams,
}));

vi.mock("@/lib/ade", () => ({
  isCieSessionMissing: mockIsCieSessionMissing,
}));

import { resolveAdeUserSession } from "./ade-user-session";

const CEDENTE = { partitaIva: "12345678901" };

beforeEach(() => {
  vi.clearAllMocks();
  mockToAdeSessionParams.mockReturnValue({
    businessId: "biz-1",
    method: "fisconline",
    credentials: { codiceFiscale: "CF", password: "pw", pin: "pin" },
  });
});

describe("resolveAdeUserSession", () => {
  it("Fisconline verificato → params pronti per withAdeSession", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "fisconline",
      codiceFiscale: "CF",
      password: "pw",
      pin: "pin",
      cedentePrestatore: CEDENTE,
    });

    const result = await resolveAdeUserSession("biz-1");

    expect(result).toEqual({
      ok: true,
      params: {
        businessId: "biz-1",
        method: "fisconline",
        credentials: { codiceFiscale: "CF", password: "pw", pin: "pin" },
      },
    });
  });

  it("Fisconline non controlla la sessione interattiva", async () => {
    // `isCieSessionMissing` interroga uno store che per Fisconline non c'entra:
    // chiamarlo comunque legherebbe il ramo credenziali a uno stato che non lo
    // riguarda.
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "fisconline",
      codiceFiscale: "CF",
      password: "pw",
      pin: "pin",
      cedentePrestatore: CEDENTE,
    });

    await resolveAdeUserSession("biz-1");

    expect(mockIsCieSessionMissing).not.toHaveBeenCalled();
  });

  it("CIE con sessione viva → params CIE", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "cie",
      cedentePrestatore: CEDENTE,
    });
    mockIsCieSessionMissing.mockReturnValue(false);
    mockToAdeSessionParams.mockReturnValue({
      businessId: "biz-1",
      method: "cie",
    });

    const result = await resolveAdeUserSession("biz-1");

    expect(result).toEqual({
      ok: true,
      params: { businessId: "biz-1", method: "cie" },
    });
  });

  it("CIE senza sessione interattiva → cie-reauth, senza messaggio", async () => {
    // Il testo lo scrive il chiamante: verifica dello scontrino in sospeso e
    // ricerca nello storico lo raccontano in due modi diversi.
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "cie",
      cedentePrestatore: CEDENTE,
    });
    mockIsCieSessionMissing.mockReturnValue(true);

    const result = await resolveAdeUserSession("biz-1");

    expect(result).toEqual({ ok: false, reason: "cie-reauth" });
  });

  it("CIE senza sessione non costruisce i params", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      method: "cie",
      cedentePrestatore: CEDENTE,
    });
    mockIsCieSessionMissing.mockReturnValue(true);

    await resolveAdeUserSession("biz-1");

    expect(mockToAdeSessionParams).not.toHaveBeenCalled();
  });

  it("credenziali assenti → unavailable, col messaggio dei prerequisiti", async () => {
    mockFetchAdePrerequisites.mockResolvedValue({
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    });

    const result = await resolveAdeUserSession("biz-1");

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    });
  });
});
