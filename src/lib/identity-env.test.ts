// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: vi.fn(),
  },
}));

const IDENTITY_ENV_VARS = [
  "NEXT_PUBLIC_APP_URL",
  "APP_HOSTNAME",
  "NEXT_PUBLIC_APP_HOSTNAME",
  "MARKETING_HOSTNAME",
  "NEXT_PUBLIC_MARKETING_HOSTNAME",
  "API_HOSTNAME",
  "NEXT_PUBLIC_API_HOSTNAME",
  "NODE_ENV",
] as const;

let originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  originalEnv = {};
  for (const k of IDENTITY_ENV_VARS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of IDENTITY_ENV_VARS) {
    if (originalEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = originalEnv[k];
    }
  }
});

describe("assertIdentityEnv — happy path", () => {
  it("returns without throwing when all identity envs are absent (defaults apply)", async () => {
    process.env.NODE_ENV = "production";
    const { assertIdentityEnv } = await import("./identity-env");
    expect(() => assertIdentityEnv()).not.toThrow();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("returns without throwing when all identity envs are valid", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.scontrinozero.it";
    process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
    process.env.NEXT_PUBLIC_MARKETING_HOSTNAME = "scontrinozero.it";
    process.env.NEXT_PUBLIC_API_HOSTNAME = "api.scontrinozero.it";
    const { assertIdentityEnv } = await import("./identity-env");
    expect(() => assertIdentityEnv()).not.toThrow();
  });
});

describe("assertIdentityEnv — failure modes in production", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  it("throws when NEXT_PUBLIC_APP_URL is malformed (not a URL)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    return import("./identity-env").then(({ assertIdentityEnv }) => {
      expect(() => assertIdentityEnv()).toThrow(/NEXT_PUBLIC_APP_URL/);
    });
  });

  it("throws when NEXT_PUBLIC_APP_URL is present-but-empty (regola 18)", () => {
    // Dockerfile bakes ARG even when not passed -> "" -> ?? default not firing.
    // Boot must catch this BEFORE any lazy call site (SCONTRINOZERO-F) sees it.
    process.env.NEXT_PUBLIC_APP_URL = "";
    return import("./identity-env").then(({ assertIdentityEnv }) => {
      expect(() => assertIdentityEnv()).toThrow(/NEXT_PUBLIC_APP_URL/);
    });
  });

  it("throws when NEXT_PUBLIC_APP_URL uses http (not https) in production", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://app.scontrinozero.it";
    return import("./identity-env").then(({ assertIdentityEnv }) => {
      expect(() => assertIdentityEnv()).toThrow(/NEXT_PUBLIC_APP_URL/);
    });
  });

  it("throws when APP_HOSTNAME has a scheme prefix", () => {
    process.env.APP_HOSTNAME = "https://app.scontrinozero.it";
    return import("./identity-env").then(({ assertIdentityEnv }) => {
      expect(() => assertIdentityEnv()).toThrow(/APP_HOSTNAME/);
    });
  });

  it("throws when MARKETING_HOSTNAME contains a slash", () => {
    process.env.MARKETING_HOSTNAME = "scontrinozero.it/";
    return import("./identity-env").then(({ assertIdentityEnv }) => {
      expect(() => assertIdentityEnv()).toThrow(/MARKETING_HOSTNAME/);
    });
  });

  it("throws when API_HOSTNAME is present-but-empty (regola 18)", () => {
    process.env.API_HOSTNAME = "";
    return import("./identity-env").then(({ assertIdentityEnv }) => {
      expect(() => assertIdentityEnv()).toThrow(/API_HOSTNAME/);
    });
  });

  it("throws when a NEXT_PUBLIC_*_HOSTNAME variant is malformed", () => {
    process.env.NEXT_PUBLIC_API_HOSTNAME = "api scontrinozero.it";
    return import("./identity-env").then(({ assertIdentityEnv }) => {
      expect(() => assertIdentityEnv()).toThrow(/NEXT_PUBLIC_API_HOSTNAME/);
    });
  });

  it("aggregates multiple failures into a single thrown message", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    process.env.APP_HOSTNAME = "https://oops";
    process.env.MARKETING_HOSTNAME = "";
    const { assertIdentityEnv } = await import("./identity-env");
    let err: Error | undefined;
    try {
      assertIdentityEnv();
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err?.message).toMatch(/NEXT_PUBLIC_APP_URL/);
    expect(err?.message).toMatch(/APP_HOSTNAME/);
    expect(err?.message).toMatch(/MARKETING_HOSTNAME/);
  });

  it("logs structured critical error before throwing (Sentry routing)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    const { assertIdentityEnv } = await import("./identity-env");
    try {
      assertIdentityEnv();
    } catch {
      // expected
    }
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        critical: true,
        errorClass: "identity_env_invalid",
      }),
      expect.stringContaining("identity env validation failed"),
    );
  });
});

describe("assertIdentityEnv — non-production behaviour", () => {
  it("logs warn but does NOT throw when envs are malformed in dev", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    process.env.APP_HOSTNAME = "https://oops";
    const { assertIdentityEnv } = await import("./identity-env");
    expect(() => assertIdentityEnv()).not.toThrow();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "identity_env_invalid" }),
      expect.stringContaining("identity env validation failed"),
    );
    // Note: getTrustedAppUrl() in trusted-app-url.ts logs its own
    // logger.error before throwing TrustedAppUrlError. That's collateral
    // to our flow — what matters is that assertIdentityEnv itself routes
    // to warn (not error) in dev.
    const ourErrorCalls = mockLoggerError.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === "string" &&
        (c[1] as string).includes("identity env validation failed"),
    );
    expect(ourErrorCalls).toHaveLength(0);
  });

  it("logs warn but does NOT throw in test", async () => {
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    const { assertIdentityEnv } = await import("./identity-env");
    expect(() => assertIdentityEnv()).not.toThrow();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it("treats unset NODE_ENV as non-production (warn, no throw)", async () => {
    delete process.env.NODE_ENV;
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    const { assertIdentityEnv } = await import("./identity-env");
    expect(() => assertIdentityEnv()).not.toThrow();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it("does not log anything when envs are valid", async () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.APP_HOSTNAME = "localhost";
    const { assertIdentityEnv } = await import("./identity-env");
    expect(() => assertIdentityEnv()).not.toThrow();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
