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

  // Scenari coperti (commenti che motivano i casi non ovvii):
  // - "baked to production" override: single Docker image buildato con prod
  //   NEXT_PUBLIC_APP_URL e deployato in sandbox via APP_HOSTNAME; senza la
  //   priorità APP_HOSTNAME i link /login /register punterebbero a produzione.
  // - "unset (client bundle case)": lato server di un deploy dove solo
  //   APP_HOSTNAME è settata (client bundle avrebbe entrambe undefined).
  // - "scheme (typo guard)": `.env` con APP_HOSTNAME=https://... produrrebbe
  //   `https://https://.../login` senza guard.
  it.each([
    {
      name: "returns absolute URL on app subdomain in production",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      cases: [
        ["/login", "https://app.scontrinozero.it/login"],
        ["/register", "https://app.scontrinozero.it/register"],
      ],
    },
    {
      name: "honours APP_HOSTNAME runtime override (sandbox)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://sandbox.scontrinozero.it",
        APP_HOSTNAME: "sandbox.scontrinozero.it",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      cases: [["/login", "https://sandbox.scontrinozero.it/login"]],
    },
    {
      name: "derives base URL from APP_HOSTNAME override even if NEXT_PUBLIC_APP_URL is baked to production",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        APP_HOSTNAME: "sandbox.scontrinozero.it",
      },
      cases: [
        ["/login", "https://sandbox.scontrinozero.it/login"],
        ["/register", "https://sandbox.scontrinozero.it/register"],
      ],
    },
    {
      name: "derives base URL from APP_HOSTNAME override when NEXT_PUBLIC_APP_URL is unset (client bundle case)",
      env: { NODE_ENV: "production", APP_HOSTNAME: "custom.example.com" },
      cases: [["/login", "https://custom.example.com/login"]],
    },
    {
      name: "falls back to hardcoded default if NEXT_PUBLIC_APP_URL is malformed (never throws)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "not-a-url",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      cases: [["/login", "https://app.scontrinozero.it/login"]],
    },
    {
      name: "falls back to hardcoded default if hostname is outside allowlist (never throws)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://evil.example.com",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      cases: [["/login", "https://app.scontrinozero.it/login"]],
    },
    {
      name: "returns localhost URL in development when env is unset",
      env: { NODE_ENV: "development" },
      cases: [["/login", "http://localhost:3000/login"]],
    },
    {
      name: "concatenates path with leading slash without producing double slash",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it/",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      cases: [["/login", "https://app.scontrinozero.it/login"]],
    },
    {
      name: "falls back to hardcoded default if APP_HOSTNAME contains a scheme (typo guard)",
      env: {
        NODE_ENV: "production",
        APP_HOSTNAME: "https://app.scontrinozero.it",
      },
      cases: [["/login", "https://app.scontrinozero.it/login"]],
    },
    {
      name: "falls back to hardcoded default if APP_HOSTNAME contains a path/slash",
      env: {
        NODE_ENV: "production",
        APP_HOSTNAME: "app.scontrinozero.it/redirect",
      },
      cases: [["/login", "https://app.scontrinozero.it/login"]],
    },
  ])("$name", async ({ env, cases }) => {
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    const { appHref } = await import("./marketing-to-app-href");
    for (const [path, expected] of cases) {
      expect(appHref(path as `/${string}`)).toBe(expected);
    }
  });
});
