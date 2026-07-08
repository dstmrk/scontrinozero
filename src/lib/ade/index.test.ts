// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { getAdeMode, createAdeClient, withAdeSession } from "./index";
import { MockAdeClient } from "./mock-client";
import { RealAdeClient } from "./real-client";
import { adeSessionCache } from "./session-cache";
import type { AdeSession } from "./client";

const FAKE_CREDENTIALS = {
  codiceFiscale: "RSSMRA80A01H501U",
  password: "secret",
  pin: "1234567890",
};
const FAKE_SESSION: AdeSession = {
  pAuth: "p",
  partitaIva: "01234567890",
  createdAt: 0,
};

describe("getAdeMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Note sui casi non ovvii:
  // - "production sandbox": sandbox gira un build di produzione con
  //   ADE_MODE=mock — NON deve lanciare.
  // - "unrecognized value": "REAL" (case sbagliato) non è riconosciuto.
  it.each([
    {
      name: 'returns "real" when ADE_MODE=real (production)',
      nodeEnv: "production",
      adeMode: "real",
      expected: "real",
    },
    {
      name: 'returns "mock" when ADE_MODE=mock (production sandbox)',
      nodeEnv: "production",
      adeMode: "mock",
      expected: "mock",
    },
    {
      name: "throws in production when ADE_MODE is absent (fail-closed)",
      nodeEnv: "production",
      adeMode: "",
      throws: /ADE_MODE non valido o assente/,
    },
    {
      name: "throws in production when ADE_MODE has an unrecognized value",
      nodeEnv: "production",
      adeMode: "REAL",
      throws: /ADE_MODE non valido o assente/,
    },
    {
      name: 'falls back to "mock" in test env when ADE_MODE is absent',
      nodeEnv: "test",
      adeMode: "",
      expected: "mock",
    },
    {
      name: 'falls back to "mock" in development when ADE_MODE has a garbage value',
      nodeEnv: "development",
      adeMode: "nonsense",
      expected: "mock",
    },
    {
      name: 'honours an explicit "real" even outside production',
      nodeEnv: "development",
      adeMode: "real",
      expected: "real",
    },
  ] as {
    name: string;
    nodeEnv: string;
    adeMode: string;
    expected?: string;
    throws?: RegExp;
  }[])("$name", ({ nodeEnv, adeMode, expected, throws }) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ADE_MODE", adeMode);
    if (throws) {
      expect(() => getAdeMode()).toThrow(throws);
    } else {
      expect(getAdeMode()).toBe(expected);
    }
  });
});

describe("createAdeClient", () => {
  it("returns a MockAdeClient for mode=mock", () => {
    expect(createAdeClient("mock")).toBeInstanceOf(MockAdeClient);
  });

  it("returns a RealAdeClient for mode=real", () => {
    expect(createAdeClient("real")).toBeInstanceOf(RealAdeClient);
  });
});

describe("withAdeSession (mock mode)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs in, runs fn with a client, then logs out", async () => {
    vi.stubEnv("ADE_MODE", "mock");
    const loginSpy = vi
      .spyOn(MockAdeClient.prototype, "login")
      .mockResolvedValue(FAKE_SESSION);
    const logoutSpy = vi
      .spyOn(MockAdeClient.prototype, "logout")
      .mockResolvedValue();
    const fn = vi.fn().mockResolvedValue("done");

    const result = await withAdeSession(
      {
        businessId: "biz-1",
        method: "fisconline",
        credentials: FAKE_CREDENTIALS,
      },
      fn,
    );

    expect(result).toBe("done");
    expect(loginSpy).toHaveBeenCalledWith(FAKE_CREDENTIALS);
    expect(fn).toHaveBeenCalledOnce();
    expect(logoutSpy).toHaveBeenCalled();
  });

  it("swallows a logout failure and still returns the fn result", async () => {
    vi.stubEnv("ADE_MODE", "mock");
    vi.spyOn(MockAdeClient.prototype, "login").mockResolvedValue(FAKE_SESSION);
    vi.spyOn(MockAdeClient.prototype, "logout").mockRejectedValue(
      new Error("logout boom"),
    );

    const result = await withAdeSession(
      {
        businessId: "biz-1",
        method: "fisconline",
        credentials: FAKE_CREDENTIALS,
      },
      () => Promise.resolve("ok"),
    );

    expect(result).toBe("ok");
  });

  it("logs out even when fn throws (no session reuse in mock)", async () => {
    vi.stubEnv("ADE_MODE", "mock");
    vi.spyOn(MockAdeClient.prototype, "login").mockResolvedValue(FAKE_SESSION);
    const logoutSpy = vi
      .spyOn(MockAdeClient.prototype, "logout")
      .mockResolvedValue();

    await expect(
      withAdeSession(
        {
          businessId: "biz-1",
          method: "fisconline",
          credentials: FAKE_CREDENTIALS,
        },
        () => Promise.reject(new Error("boom")),
      ),
    ).rejects.toThrow("boom");

    expect(logoutSpy).toHaveBeenCalled();
  });

  it("real mode: delegates to the session cache (no per-op logout)", async () => {
    vi.stubEnv("ADE_MODE", "real");
    const runSpy = vi
      .spyOn(adeSessionCache, "run")
      .mockResolvedValue("from-cache" as never);
    const fn = vi.fn();

    const result = await withAdeSession(
      {
        businessId: "biz-1",
        method: "fisconline",
        credentials: FAKE_CREDENTIALS,
      },
      fn,
    );

    expect(result).toBe("from-cache");
    expect(runSpy).toHaveBeenCalledWith("biz-1", FAKE_CREDENTIALS, fn);
  });
});
