// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTrustedAppUrl = vi.fn();
vi.mock("@/lib/trusted-app-url", () => ({
  getTrustedAppUrl: () => mockGetTrustedAppUrl(),
  TrustedAppUrlError: class TrustedAppUrlError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TrustedAppUrlError";
    }
  },
}));

vi.mock("@/lib/version", () => ({
  getAppRelease: () => "scontrinozero@1.3.6+abc1234",
}));

const HOSTNAME_ENV_VARS = [
  "APP_HOSTNAME",
  "NEXT_PUBLIC_APP_HOSTNAME",
  "MARKETING_HOSTNAME",
  "NEXT_PUBLIC_MARKETING_HOSTNAME",
  "API_HOSTNAME",
  "NEXT_PUBLIC_API_HOSTNAME",
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  for (const k of HOSTNAME_ENV_VARS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of HOSTNAME_ENV_VARS) {
    if (originalEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = originalEnv[k];
    }
  }
});

describe("GET /api/_health/env", () => {
  it("returns 200 with appUrl, release, and parsed hostnames when env is valid", async () => {
    mockGetTrustedAppUrl.mockReturnValue("https://app.scontrinozero.it");
    process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
    process.env.NEXT_PUBLIC_MARKETING_HOSTNAME = "scontrinozero.it";
    process.env.NEXT_PUBLIC_API_HOSTNAME = "api.scontrinozero.it";

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      appUrl: string;
      release: string;
      hostnames: Record<string, string>;
    };
    expect(body.status).toBe("ok");
    expect(body.appUrl).toBe("https://app.scontrinozero.it");
    expect(body.release).toBe("scontrinozero@1.3.6+abc1234");
    expect(body.hostnames).toEqual({
      app: "app.scontrinozero.it",
      marketing: "scontrinozero.it",
      api: "api.scontrinozero.it",
    });
  });

  it("prefers runtime override (APP_HOSTNAME) over baked-at-build (NEXT_PUBLIC_APP_HOSTNAME)", async () => {
    // Mirrors trusted-app-url.ts / next.config.ts precedence: a sandbox/
    // self-hosted instance set APP_HOSTNAME at runtime to override the
    // build-time NEXT_PUBLIC_APP_HOSTNAME baked in the image.
    mockGetTrustedAppUrl.mockReturnValue("https://sandbox.scontrinozero.it");
    process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
    process.env.APP_HOSTNAME = "sandbox.scontrinozero.it";

    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { hostnames: Record<string, string> };
    expect(body.hostnames.app).toBe("sandbox.scontrinozero.it");
  });

  it("returns 503 with error when getTrustedAppUrl throws (TrustedAppUrlError)", async () => {
    // Defense in depth: assertIdentityEnv runs at boot, but if envs change
    // (e.g. mounted Secret rotation) this endpoint still catches a stale
    // misconfig at request time.
    const { TrustedAppUrlError } = await import("@/lib/trusted-app-url");
    mockGetTrustedAppUrl.mockImplementation(() => {
      throw new TrustedAppUrlError("NEXT_PUBLIC_APP_URL malformed");
    });

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("not_ok");
    expect(body.error).toContain("NEXT_PUBLIC_APP_URL malformed");
  });

  it("returns 503 on an unexpected throw, without leaking the stack trace", async () => {
    mockGetTrustedAppUrl.mockImplementation(() => {
      throw new Error("Connection to secret store reset by peer");
    });

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("not_ok");
    // Generic message — no stack, no internal infra detail
    expect(body.error).toMatch(/identity env unavailable/i);
    expect(body.error).not.toContain("Connection to secret store");
  });

  it("hostnames default to 'unset' string when no env override is provided", async () => {
    // Make the absence explicit in the smoke output — 'undefined' would be
    // ambiguous when piped through curl + jq.
    mockGetTrustedAppUrl.mockReturnValue("https://app.scontrinozero.it");

    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { hostnames: Record<string, string> };
    expect(body.hostnames.app).toBe("unset");
    expect(body.hostnames.marketing).toBe("unset");
    expect(body.hostnames.api).toBe("unset");
  });
});
