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

  // SCONTRINOZERO-F: il Dockerfile bakava `ENV NEXT_PUBLIC_APP_URL=` (stringa
  // vuota) quando l'ARG non veniva passato (prod/sandbox). Il `?? default`
  // NON scatta su present-but-empty → `new URL("")` lanciava → 503 su ogni
  // checkout/portal Stripe. Empty/whitespace va trattato come assente, e in
  // produzione il default deve essere l'host app (https + allowlist), non
  // localhost. (CLAUDE.md regola 18.)
  it.each([
    {
      name: "returns the URL when valid (production + https + allowlisted host)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "strips trailing slash",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it/",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "allows APP_HOSTNAME as runtime override (sandbox/self-hosted)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://sandbox.scontrinozero.it",
        APP_HOSTNAME: "sandbox.scontrinozero.it",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      expected: "https://sandbox.scontrinozero.it",
    },
    {
      name: "allows http://localhost in non-production",
      env: {
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      },
      expected: "http://localhost:3000",
    },
    {
      name: "defaults to http://localhost:3000 when NEXT_PUBLIC_APP_URL is unset (dev only)",
      env: { NODE_ENV: "development" },
      expected: "http://localhost:3000",
    },
    {
      name: "defaults to the prod app URL when NEXT_PUBLIC_APP_URL is present-but-empty in production",
      env: { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "" },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "treats a whitespace-only NEXT_PUBLIC_APP_URL as unset in production",
      env: { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "   " },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "defaults to the prod app URL when NEXT_PUBLIC_APP_URL is unset in production",
      env: { NODE_ENV: "production" },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "falls back to localhost when NEXT_PUBLIC_APP_URL is present-but-empty in dev",
      env: { NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "" },
      expected: "http://localhost:3000",
    },
    // REVIEW.md #93 — un'immagine sola serve prod E sandbox, quindi
    // `NEXT_PUBLIC_APP_URL` è bakata col valore di produzione anche nel
    // container sandbox: `APP_HOSTNAME` è l'unico segnale runtime che
    // distingue i due ambienti. Senza questa precedenza il QR stampato sui
    // PDF e le `success_url` Stripe di sandbox puntano a produzione.
    {
      name: "prefers the APP_HOSTNAME runtime override over a baked production NEXT_PUBLIC_APP_URL",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        APP_HOSTNAME: "sandbox.scontrinozero.it",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      expected: "https://sandbox.scontrinozero.it",
    },
    {
      name: "applies the APP_HOSTNAME override when NEXT_PUBLIC_APP_URL is unset",
      env: {
        NODE_ENV: "production",
        APP_HOSTNAME: "sandbox.scontrinozero.it",
      },
      expected: "https://sandbox.scontrinozero.it",
    },
    {
      name: "applies the APP_HOSTNAME override when NEXT_PUBLIC_APP_URL is present-but-empty",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "",
        APP_HOSTNAME: "sandbox.scontrinozero.it",
      },
      expected: "https://sandbox.scontrinozero.it",
    },
    {
      name: "is a no-op in production, where APP_HOSTNAME matches the baked URL",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        APP_HOSTNAME: "app.scontrinozero.it",
      },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "normalises a mixed-case, trailing-dot APP_HOSTNAME",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        APP_HOSTNAME: "Sandbox.ScontrinoZero.it.",
      },
      expected: "https://sandbox.scontrinozero.it",
    },
    // Un `APP_HOSTNAME=https://…` o `…/redirect` nel `.env` produrrebbe un URL
    // malformato o un link verso un path arbitrario: si ignora l'override e si
    // ricade sulla catena esistente, che resta validata contro l'allowlist.
    // In produzione questo caso non arriva neppure qui — `assertIdentityEnv()`
    // blocca il boot (regola 24) — ma la guardia lazy resta il secondo strato.
    {
      name: "ignores an APP_HOSTNAME carrying a scheme",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        APP_HOSTNAME: "https://sandbox.scontrinozero.it",
      },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "ignores an APP_HOSTNAME carrying a path",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        APP_HOSTNAME: "sandbox.scontrinozero.it/redirect",
      },
      expected: "https://app.scontrinozero.it",
    },
    {
      name: "ignores a present-but-empty APP_HOSTNAME (regola 18)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it",
        APP_HOSTNAME: "   ",
      },
      expected: "https://app.scontrinozero.it",
    },
    // L'override è hostname-only: se sostituisse l'host anche quando coincide
    // con quello già configurato, in locale perderebbe la porta.
    {
      name: "keeps the dev port when APP_HOSTNAME matches the configured host",
      env: {
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        APP_HOSTNAME: "localhost",
      },
      expected: "http://localhost:3000",
    },
  ])("$name", async ({ env, expected }) => {
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    expect(getTrustedAppUrl()).toBe(expected);
  });

  it.each([
    {
      name: "throws on malformed URL",
      env: { NEXT_PUBLIC_APP_URL: "not-a-url" },
    },
    {
      name: "throws in production when protocol is not https",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "http://app.scontrinozero.it",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      messageMatch: /https/,
    },
    {
      name: "throws in production when hostname is not allowlisted",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://evil.example.com",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
      messageMatch: /allowlist/,
    },
    {
      name: "does NOT allow look-alike subdomain (subdomain spoofing)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.scontrinozero.it.evil.tld",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
    },
    {
      name: "does NOT allow localhost in production (forces deploy-time config)",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://localhost:3000",
        NEXT_PUBLIC_APP_HOSTNAME: "app.scontrinozero.it",
      },
    },
  ] as { name: string; env: Record<string, string>; messageMatch?: RegExp }[])(
    "$name",
    async ({ env, messageMatch }) => {
      for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
      }
      const { getTrustedAppUrl, TrustedAppUrlError } =
        await import("./trusted-app-url");
      expect(() => getTrustedAppUrl()).toThrow(TrustedAppUrlError);
      if (messageMatch) {
        expect(() => getTrustedAppUrl()).toThrow(messageMatch);
      }
    },
  );

  it("normalises NEXT_PUBLIC_APP_HOSTNAME before matching the allowlist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sandbox.scontrinozero.it");
    vi.stubEnv("NEXT_PUBLIC_APP_HOSTNAME", "Sandbox.ScontrinoZero.it");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    expect(getTrustedAppUrl()).toBe("https://sandbox.scontrinozero.it");
  });

  it("does NOT log a critical error when env is empty in production (no false alarm)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const { logger } = await import("@/lib/logger");
    const { getTrustedAppUrl } = await import("./trusted-app-url");
    getTrustedAppUrl();
    expect(logger.error).not.toHaveBeenCalled();
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
