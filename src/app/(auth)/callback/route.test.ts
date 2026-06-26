// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockExchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  }),
}));

const mockLoggerError = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // I test che stubbano NEXT_PUBLIC_APP_URL non devono sporcare gli altri,
    // che si appoggiano al default localhost di getTrustedAppUrl().
    vi.unstubAllEnvs();
  });

  it("exchanges code for session and redirects to /dashboard", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?code=test-code",
    );
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("test-code");
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/dashboard");
  });

  it("uses redirect param when provided", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?code=test-code&redirect=/onboarding",
    );
    const response = await GET(request);

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/onboarding");
  });

  it("redirects to /login with error when no code provided", async () => {
    const { GET } = await import("./route");

    const request = new Request("http://localhost:3000/callback");
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_callback_failed");
  });

  it("redirects to /login with error when code exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid code" },
    });
    const { GET } = await import("./route");

    const request = new Request("http://localhost:3000/callback?code=bad-code");
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_callback_failed");
  });

  it("ignores absolute redirect param to prevent open redirect", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?code=test-code&redirect=https://evil.com",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("localhost");
    expect(location.pathname).toBe("/dashboard");
  });

  it("ignores redirect param without leading slash", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?code=test-code&redirect=evil.com/phishing",
    );
    const response = await GET(request);

    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("localhost");
    expect(location.pathname).toBe("/dashboard");
  });

  it("preserves query string inside the redirect param (deep-link state)", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?code=test-code&redirect=/dashboard/storico%3Ffrom%3D2024-01-01%26to%3D2024-01-31",
    );
    const response = await GET(request);

    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("localhost");
    expect(location.pathname).toBe("/dashboard/storico");
    expect(location.searchParams.get("from")).toBe("2024-01-01");
    expect(location.searchParams.get("to")).toBe("2024-01-31");
  });

  it("ignores protocol-relative redirect (//evil.com) to prevent open redirect", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?code=test-code&redirect=//evil.com",
    );
    const response = await GET(request);

    const location = new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("localhost");
    expect(location.pathname).toBe("/dashboard");
  });

  it("builds the redirect host from NEXT_PUBLIC_APP_URL, not the request host", async () => {
    // Regressione 0.0.0.0:3000: dietro Cloudflare Tunnel request.url si risolve
    // all'host interno di bind. Il redirect deve usare l'app URL configurato.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it");
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request("http://0.0.0.0:3000/callback?code=test-code");
    const response = await GET(request);

    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("app.scontrinozero.it");
    expect(location.pathname).toBe("/dashboard");
  });

  it("lands the password-reset success on the configured host", async () => {
    // Caso success del nuovo flusso: token valido → /reset-password/update sul
    // dominio pubblico, non sull'host interno del container.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.scontrinozero.it");
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request(
      "http://0.0.0.0:3000/callback?code=test-code&redirect=/reset-password/update",
    );
    const response = await GET(request);

    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("app.scontrinozero.it");
    expect(location.pathname).toBe("/reset-password/update");
  });

  it("falls back to the request origin (no 500) if NEXT_PUBLIC_APP_URL is malformed", async () => {
    // Difesa in profondità: la regola 24 valida l'env fail-fast al boot, ma se
    // getTrustedAppUrl() lanciasse a runtime NON dobbiamo bloccare il flusso di
    // conferma email / OAuth / reset con un 500 — degradiamo all'origin.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const request = new Request("http://0.0.0.0:3000/callback?code=test-code");
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("0.0.0.0:3000");
    expect(location.pathname).toBe("/dashboard");
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ critical: true }),
      expect.stringContaining("getTrustedAppUrl failed"),
    );
  });
});
