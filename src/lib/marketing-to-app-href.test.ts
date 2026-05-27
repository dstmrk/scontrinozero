// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("appHref", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_HOSTNAME;
    delete process.env.NEXT_PUBLIC_APP_HOSTNAME;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns absolute URL on app subdomain in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
    expect(appHref("/register")).toBe("https://app.scontrinozero.it/register");
  });

  it("honours APP_HOSTNAME runtime override (sandbox)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sandbox.scontrinozero.it");
    vi.stubEnv("APP_HOSTNAME", "sandbox.scontrinozero.it");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://sandbox.scontrinozero.it/login");
  });

  it("falls back to hardcoded default if NEXT_PUBLIC_APP_URL is malformed (never throws)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not-a-url");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
  });

  it("falls back to hardcoded default if hostname is outside allowlist (never throws)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://evil.example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
  });

  it("returns localhost URL in development when env is unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("http://localhost:3000/login");
  });

  it("concatenates path with leading slash without producing double slash", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it/");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "app.scontrinozero.it");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
  });
});
