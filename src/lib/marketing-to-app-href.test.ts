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

  it("derives base URL from APP_HOSTNAME runtime override even if NEXT_PUBLIC_APP_URL is baked to production", async () => {
    // Scenario: single Docker image built with prod NEXT_PUBLIC_APP_URL and
    // deployed in sandbox with APP_HOSTNAME override. Without this priority,
    // /login and /register links would point to production.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it");
    vi.stubEnv("APP_HOSTNAME", "sandbox.scontrinozero.it");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://sandbox.scontrinozero.it/login");
    expect(appHref("/register")).toBe(
      "https://sandbox.scontrinozero.it/register",
    );
  });

  it("derives base URL from APP_HOSTNAME runtime override when NEXT_PUBLIC_APP_URL is unset (client bundle case)", async () => {
    // In client bundles process.env.NEXT_PUBLIC_APP_URL is whatever was baked
    // at build time. If not baked, it's undefined; APP_HOSTNAME (server-only)
    // is also undefined client-side, so this test simulates the server side
    // of a deployment where only APP_HOSTNAME is set.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_HOSTNAME", "custom.example.com");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://custom.example.com/login");
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

  it("falls back to hardcoded default if APP_HOSTNAME contains a scheme (typo guard)", async () => {
    // `.env` typo: APP_HOSTNAME=https://app.scontrinozero.it
    // → senza guard produrrebbe `https://https://app.scontrinozero.it/login`.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_HOSTNAME", "https://app.scontrinozero.it");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
  });

  it("falls back to hardcoded default if APP_HOSTNAME contains a path/slash", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_HOSTNAME", "app.scontrinozero.it/redirect");
    const { appHref } = await import("./marketing-to-app-href");
    expect(appHref("/login")).toBe("https://app.scontrinozero.it/login");
  });
});
