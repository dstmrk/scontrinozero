// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("getTrustedAppUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_HOSTNAME;
    delete process.env.NEXT_PUBLIC_APP_HOSTNAME;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the URL when valid (production + https + allowlisted host)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    expect(getTrustedAppUrl()).toBe("https://app.scontrinozero.it");
  });

  it("strips trailing slash", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it/");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    expect(getTrustedAppUrl()).toBe("https://app.scontrinozero.it");
  });

  it("allows APP_HOSTNAME as runtime override (sandbox/self-hosted)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sandbox.scontrinozero.it");
    vi.stubEnv("APP_HOSTNAME", "sandbox.scontrinozero.it");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    expect(getTrustedAppUrl()).toBe("https://sandbox.scontrinozero.it");
  });

  it("throws on malformed URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not-a-url");
    const { getTrustedAppUrl, TrustedAppUrlError } =
      await import("./trusted-app-url");
    expect(() => getTrustedAppUrl()).toThrow(TrustedAppUrlError);
  });

  it("throws in production when protocol is not https", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://app.scontrinozero.it");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { getTrustedAppUrl, TrustedAppUrlError } =
      await import("./trusted-app-url");
    expect(() => getTrustedAppUrl()).toThrow(TrustedAppUrlError);
    expect(() => getTrustedAppUrl()).toThrow(/https/);
  });

  it("throws in production when hostname is not allowlisted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://evil.example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { getTrustedAppUrl, TrustedAppUrlError } =
      await import("./trusted-app-url");
    expect(() => getTrustedAppUrl()).toThrow(TrustedAppUrlError);
    expect(() => getTrustedAppUrl()).toThrow(/allowlist/);
  });

  it("does NOT allow look-alike subdomain (subdomain spoofing)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it.evil.tld");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { getTrustedAppUrl, TrustedAppUrlError } =
      await import("./trusted-app-url");
    expect(() => getTrustedAppUrl()).toThrow(TrustedAppUrlError);
  });

  it("allows http://localhost in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    expect(getTrustedAppUrl()).toBe("http://localhost:3000");
  });

  it("does NOT allow localhost in production (forces deploy-time config)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { getTrustedAppUrl, TrustedAppUrlError } =
      await import("./trusted-app-url");
    expect(() => getTrustedAppUrl()).toThrow(TrustedAppUrlError);
  });

  it("defaults to http://localhost:3000 when NEXT_PUBLIC_APP_URL is unset (dev only)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    expect(getTrustedAppUrl()).toBe("http://localhost:3000");
  });

  it("logs critical:true when validation fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://evil.example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { logger } = await import("@/lib/logger");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    try {
      getTrustedAppUrl();
    } catch {
      // expected
    }
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ critical: true }),
      expect.any(String),
    );
  });
});
