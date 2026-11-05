// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockExchangeCodeForSession = vi.fn();
const mockVerifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      verifyOtp: mockVerifyOtp,
    },
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

  it("flags an expired/invalid signup confirmation link with auth_callback_failed", async () => {
    // Caso reale otp_expired su un link di conferma email: signUp/resendConfirmationEmail
    // puntano a /callback?redirect=/dashboard, Supabase rimanda qui con l'errore nel
    // fragment (invisibile al server) e senza code. Prima della fix, emailRedirectTo
    // puntava direttamente a /dashboard: /callback non veniva mai attraversato e
    // l'utente atterrava su /login senza alcun messaggio (il fragment non viene letto
    // dalla pagina di login).
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?redirect=/dashboard",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_callback_failed");
  });

  it("flags an expired/invalid reset link with reset_link_invalid", async () => {
    // Caso reale otp_expired: Supabase rimanda a /callback?redirect=/reset-password/update
    // con l'errore nel fragment (invisibile al server) e senza code. Dal redirect
    // param capiamo che era un link di reset e diamo a /login il codice mirato.
    const { GET } = await import("./route");

    const request = new Request(
      "http://localhost:3000/callback?redirect=/reset-password/update",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("reset_link_invalid");
  });

  describe("recovery link (token_hash)", () => {
    // Il link di reset nasce da `admin.generateLink`, che non usa PKCE: se
    // passasse da GoTrue /verify tornerebbe con i token nel fragment e senza
    // `code`, e questa route lo scambierebbe per un link scaduto (bug del
    // 05/11/2026). Per questo l'email porta qui il `token_hash` e la sessione
    // si crea lato server con verifyOtp.
    const RESET_URL =
      "http://localhost:3000/callback?token_hash=hash123&type=recovery&redirect=/reset-password/update";

    it("verifies the token_hash and lands on /reset-password/update", async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      const { GET } = await import("./route");

      const response = await GET(new Request(RESET_URL));

      expect(mockVerifyOtp).toHaveBeenCalledWith({
        type: "recovery",
        token_hash: "hash123",
      });
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/reset-password/update");
    });

    it("flags an expired or already-used token_hash with reset_link_invalid", async () => {
      mockVerifyOtp.mockResolvedValue({
        error: { message: "Email link is invalid or has expired" },
      });
      const { GET } = await import("./route");

      const response = await GET(new Request(RESET_URL));

      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("error")).toBe("reset_link_invalid");
    });

    it("ignores a token_hash with a type other than recovery", async () => {
      // Solo il reset passa da token_hash: un `type` diverso non apre una
      // sessione per una via che nessuna nostra email genera.
      const { GET } = await import("./route");

      const response = await GET(
        new Request(
          "http://localhost:3000/callback?token_hash=hash123&type=magiclink",
        ),
      );

      expect(mockVerifyOtp).not.toHaveBeenCalled();
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("error")).toBe("auth_callback_failed");
    });

    it("treats type=recovery without token_hash as an invalid reset link", async () => {
      const { GET } = await import("./route");

      const response = await GET(
        new Request("http://localhost:3000/callback?type=recovery"),
      );

      expect(mockVerifyOtp).not.toHaveBeenCalled();
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("error")).toBe("reset_link_invalid");
    });

    it("still rejects an absolute redirect on the recovery branch", async () => {
      mockVerifyOtp.mockResolvedValue({ error: null });
      const { GET } = await import("./route");

      const response = await GET(
        new Request(
          "http://localhost:3000/callback?token_hash=hash123&type=recovery&redirect=https://evil.com",
        ),
      );

      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("localhost");
      expect(location.pathname).toBe("/dashboard");
    });
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
