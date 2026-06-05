// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock the middleware Supabase client
const mockGetUser = vi.fn();
let capturedResponse: NextResponse;
vi.mock("@/lib/supabase/middleware", () => ({
  createMiddlewareSupabaseClient: vi
    .fn()
    .mockImplementation((request: NextRequest) => {
      capturedResponse = NextResponse.next({ request });
      return {
        supabase: { auth: { getUser: mockGetUser } },
        response: () => capturedResponse,
      };
    }),
}));

function createRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  });
  afterEach(() => vi.unstubAllEnvs());

  describe("Supabase not configured", () => {
    it("dev/test: passes through all routes when NEXT_PUBLIC_SUPABASE_URL is not set", async () => {
      vi.stubEnv("NODE_ENV", "test");
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      vi.resetModules();
      const { proxy } = await import("./proxy");

      // Even protected routes should pass through in non-production envs
      const response = await proxy(createRequest("/dashboard"));
      expect(response.status).toBe(200);
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("production: fail-closed redirects protected routes to /login when SUPABASE_URL missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      vi.resetModules();
      const { proxy } = await import("./proxy");

      // Protected routes must NOT pass through silently in production —
      // would be fail-open auth bypass on RSC pages.
      const response = await proxy(createRequest("/dashboard"));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("production: public routes still pass through when SUPABASE_URL missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      vi.resetModules();
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/"));
      expect(response.status).toBe(200);
    });
  });

  describe("public routes", () => {
    it("allows unauthenticated access to /", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/"));
      expect(response.status).toBe(200);
    });

    it("allows unauthenticated access to /privacy", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/privacy"));
      expect(response.status).toBe(200);
    });

    it("allows authenticated access to /", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
      });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/"));
      expect(response.status).toBe(200);
    });
  });

  describe("protected routes — unauthenticated", () => {
    it("redirects /dashboard to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/dashboard"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe("/dashboard");
    });

    it("redirects /dashboard/settings to /login with redirect param", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/dashboard/settings"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe("/dashboard/settings");
    });

    it("preserves query string in the redirect param (deep-link state)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequest("/dashboard/storico?from=2024-01-01&to=2024-01-31"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe(
        "/dashboard/storico?from=2024-01-01&to=2024-01-31",
      );
    });

    it("keeps redirect param equal to pathname when there is no query string", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/dashboard/storico"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("redirect")).toBe("/dashboard/storico");
    });

    it("preserves query string when Supabase is not configured in production (fail-closed)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      vi.resetModules();
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequest("/dashboard/storico?from=2024-01-01"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe(
        "/dashboard/storico?from=2024-01-01",
      );
    });

    it("redirects /onboarding to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/onboarding"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
    });
  });

  describe("protected routes — authenticated", () => {
    it("allows authenticated access to /dashboard", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/dashboard"));
      expect(response.status).toBe(200);
    });

    it("allows authenticated access to /onboarding", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/onboarding"));
      expect(response.status).toBe(200);
    });
  });

  describe("auth-only routes — redirect if authenticated", () => {
    it("redirects /login to /dashboard when authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/login"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/dashboard");
    });

    it("redirects /register to /dashboard when authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/register"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/dashboard");
    });

    it("allows unauthenticated access to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/login"));
      expect(response.status).toBe(200);
    });
  });

  describe("getUser failure (stale refresh token)", () => {
    function makeAuthError() {
      return Object.assign(
        new Error("Invalid Refresh Token: Refresh Token Not Found"),
        { __isAuthError: true, status: 400, code: "refresh_token_not_found" },
      );
    }

    it("treats an AuthApiError as unauthenticated and redirects protected route to /login", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockGetUser.mockRejectedValue(makeAuthError());
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/dashboard"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe("/dashboard");
      // A structured breadcrumb is emitted instead of a raw stack trace.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("refresh_token_not_found"),
      );
      warnSpy.mockRestore();
    });

    it("does not block public routes when getUser throws", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockGetUser.mockRejectedValue(makeAuthError());
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/"));
      expect(response.status).toBe(200);
      warnSpy.mockRestore();
    });

    it("uses a generic errorClass when the thrown value has no code", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockGetUser.mockRejectedValue(new Error("network down"));
      const { proxy } = await import("./proxy");

      const response = await proxy(createRequest("/dashboard"));
      expect(response.status).toBe(307);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("auth_error"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("hostname routing", () => {
    function createRequestForHost(pathname: string, host: string): NextRequest {
      return new NextRequest(`https://${host}${pathname}`, {
        headers: { host },
      });
    }

    beforeEach(() => {
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "app.scontrinozero.it";
      process.env.NEXT_PUBLIC_MARKETING_HOSTNAME = "scontrinozero.it";
    });

    afterEach(() => {
      delete process.env.NEXT_PUBLIC_APP_HOSTNAME;
      delete process.env.NEXT_PUBLIC_MARKETING_HOSTNAME;
    });

    it("allows / on marketing domain (public route)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/", "scontrinozero.it"),
      );
      expect(response.status).toBe(200);
    });

    it("allows /privacy on marketing domain (marketing-only route)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/privacy", "scontrinozero.it"),
      );
      expect(response.status).toBe(200);
    });

    it("allows /help on marketing domain (marketing-only route)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/help", "scontrinozero.it"),
      );
      expect(response.status).toBe(200);
    });

    it("allows /help/api on marketing domain (help subroute)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/help/api", "scontrinozero.it"),
      );
      expect(response.status).toBe(200);
    });

    it("redirects /help on app domain to marketing domain", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/help", "app.scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("scontrinozero.it");
      expect(location.pathname).toBe("/help");
    });

    it("redirects /dashboard on marketing domain to app domain", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/dashboard", "scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("app.scontrinozero.it");
      expect(location.pathname).toBe("/dashboard");
    });

    it("redirects / on app domain to /dashboard", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/", "app.scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/dashboard");
    });

    it("redirects /termini on app domain to marketing domain", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/termini", "app.scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("scontrinozero.it");
      expect(location.pathname).toBe("/termini");
    });

    it("preserves query string on app→marketing redirect", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/privacy?lang=en", "app.scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("scontrinozero.it");
      expect(location.pathname).toBe("/privacy");
      expect(location.search).toBe("?lang=en");
    });

    it("allows /dashboard on app domain for authenticated users", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/dashboard", "app.scontrinozero.it"),
      );
      expect(response.status).toBe(200);
    });

    it("redirects /login on www subdomain to app domain (non-marketing route)", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/login", "www.scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("app.scontrinozero.it");
      expect(location.pathname).toBe("/login");
    });

    it("redirects /login on bare marketing domain to app domain", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/login", "scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("app.scontrinozero.it");
      expect(location.pathname).toBe("/login");
    });

    it("redirects /register on bare marketing domain to app domain", async () => {
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/register", "scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("app.scontrinozero.it");
      expect(location.pathname).toBe("/register");
    });

    it("passes through /api/v1/receipts on api subdomain without redirect", async () => {
      process.env.NEXT_PUBLIC_API_HOSTNAME = "api.scontrinozero.it";
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        createRequestForHost("/api/v1/receipts", "api.scontrinozero.it"),
      );
      expect(response.status).toBe(200);
    });

    it("passes through /api/v1/* on api subdomain even without auth session", async () => {
      process.env.NEXT_PUBLIC_API_HOSTNAME = "api.scontrinozero.it";
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      // Should not redirect to /login even though user is null
      const response = await proxy(
        createRequestForHost(
          "/api/v1/receipts/doc-123",
          "api.scontrinozero.it",
        ),
      );
      expect(response.status).toBe(200);
    });

    it("strips port from Host header before comparing hostnames (e.g. scontrinozero.it:443)", async () => {
      const { proxy } = await import("./proxy");

      // Host header includes port — should still be recognised as marketing domain
      const response = await proxy(
        createRequestForHost("/dashboard", "scontrinozero.it:443"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("app.scontrinozero.it");
    });

    it("does not redirect cross-domain when hostname is outside the allowlist (safe-deny)", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      // Spoofed/unknown host: must NOT trigger an implicit cross-domain redirect.
      const response = await proxy(
        createRequestForHost("/dashboard", "evil.example.com"),
      );
      // Still subject to auth gating: /dashboard with no user → /login on same host.
      // The key invariant is that we never redirect to app/marketing hostname.
      const location = response.headers.get("location");
      if (location) {
        const url = new URL(location);
        expect(url.hostname).not.toBe("app.scontrinozero.it");
        expect(url.hostname).not.toBe("scontrinozero.it");
      } else {
        expect(response.status).toBe(200);
      }
    });

    it("falls back to default when NEXT_PUBLIC_APP_HOSTNAME is malformed (no scheme leak)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      // Attacker-controlled env var with scheme leak: must be rejected and
      // the default app hostname used instead — never honour the malformed value.
      process.env.NEXT_PUBLIC_APP_HOSTNAME = "https://evil.com";
      vi.resetModules();
      const { proxy } = await import("./proxy");

      // Request /dashboard on marketing → expect redirect to the *default*
      // app hostname, not to evil.com.
      const response = await proxy(
        createRequestForHost("/dashboard", "scontrinozero.it"),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("app.scontrinozero.it");
      expect(location.hostname).not.toBe("evil.com");
    });

    it("APP_HOSTNAME runtime override is honoured (sandbox/self-host)", async () => {
      // Su sandbox/self-host l'immagine è buildata con NEXT_PUBLIC_APP_HOSTNAME=
      // app.scontrinozero.it (baked) ma a runtime APP_HOSTNAME=sandbox.scontrinozero.it
      // sovrascrive. Senza questa precedenza il proxy cadrebbe in safe-deny
      // sull'host sandbox e non triggererebbe il redirect / → /dashboard.
      process.env.APP_HOSTNAME = "sandbox.scontrinozero.it";
      vi.resetModules();
      try {
        const { proxy } = await import("./proxy");

        const response = await proxy(
          createRequestForHost("/", "sandbox.scontrinozero.it"),
        );
        expect(response.status).toBe(307);
        const location = new URL(response.headers.get("location")!);
        expect(location.pathname).toBe("/dashboard");
      } finally {
        delete process.env.APP_HOSTNAME;
      }
    });

    it("APP_HOSTNAME takes precedence over NEXT_PUBLIC_APP_HOSTNAME", async () => {
      // Both set, runtime override wins. The baked hostname must NOT trigger
      // the /  → /dashboard branch on its own host.
      process.env.APP_HOSTNAME = "sandbox.scontrinozero.it";
      // NEXT_PUBLIC_APP_HOSTNAME stays "app.scontrinozero.it" from beforeEach.
      vi.resetModules();
      try {
        const { proxy } = await import("./proxy");

        // Request on the baked hostname (app.scontrinozero.it): with the
        // runtime override pointing to sandbox, app.scontrinozero.it is now
        // OUTSIDE the allowlist → safe-deny, no app-domain redirect to /dashboard.
        const response = await proxy(
          createRequestForHost("/", "app.scontrinozero.it"),
        );
        // Either passes through (200) or routes through Supabase auth — the
        // invariant is that no implicit cross-domain redirect was issued.
        const location = response.headers.get("location");
        if (location) {
          const url = new URL(location);
          expect(url.pathname).not.toBe("/dashboard");
        } else {
          expect(response.status).toBe(200);
        }
      } finally {
        delete process.env.APP_HOSTNAME;
      }
    });

    it("uses the Host header as source of truth: marketing apex in header, internal nextUrl.hostname → marketing redirect", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      // Riproduce il caso produzione dietro Cloudflare Tunnel: nextUrl.hostname
      // riflette l'origin interno, ma l'header Host porta l'apex marketing reale.
      // Il routing deve seguire l'header → /login su marketing redirige ad app.
      const req = new NextRequest("https://internal.local/login", {
        headers: { host: "scontrinozero.it" },
      });
      const response = await proxy(req);
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe("app.scontrinozero.it");
      expect(location.pathname).toBe("/login");
    });

    it("classifies by the Host header (app) even when nextUrl.hostname is marketing", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      // Header dice app → / su dominio app redirige a /dashboard, a prescindere
      // dall'host dell'URL parsato.
      const req = new NextRequest("https://scontrinozero.it/", {
        headers: { host: "app.scontrinozero.it" },
      });
      const response = await proxy(req);
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe(
        "/dashboard",
      );
    });

    it("never emits a proxyHostSource breadcrumb, even when Host header and nextUrl.hostname differ", async () => {
      // Regression: in standalone dietro Cloudflare Tunnel nextUrl.hostname è
      // sempre il bind address (0.0.0.0), quindi il vecchio breadcrumb
      // diagnostico floodava i log con un warn per ogni richiesta. La sua root
      // cause (noindex sull'apex) è già fixata: nessun segnale residuo.
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { proxy } = await import("./proxy");

      await proxy(createRequestForHost("/", "scontrinozero.it"));
      await proxy(
        new NextRequest("https://internal.local/", {
          headers: { host: "scontrinozero.it" },
        }),
      );

      expect(
        warnSpy.mock.calls.filter((c) =>
          String(c[0]).includes("proxyHostSource"),
        ),
      ).toHaveLength(0);
      warnSpy.mockRestore();
    });
  });

  describe("X-Robots-Tag noindex on non-production hosts", () => {
    it("does NOT add noindex on the production marketing apex", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        new NextRequest("https://scontrinozero.it/"),
      );
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
    });

    it("does NOT add noindex when the Host header is the marketing apex even if nextUrl.hostname is the internal origin", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      // Caso produzione dietro Cloudflare Tunnel: l'header Host è l'apex
      // marketing indicizzabile → la landing pubblica NON deve essere noindex,
      // anche se nextUrl.hostname riflette l'origin interno.
      const response = await proxy(
        new NextRequest("https://internal.local/", {
          headers: { host: "scontrinozero.it" },
        }),
      );
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
    });

    it("adds noindex on the sandbox host", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        new NextRequest("https://sandbox.scontrinozero.it/guide"),
      );
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("adds noindex on a self-hosted custom domain", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { proxy } = await import("./proxy");

      const response = await proxy(
        new NextRequest("https://cassa.example.com/"),
      );
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("adds noindex on non-prod hosts even when Supabase is not configured", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      vi.resetModules();
      const { proxy } = await import("./proxy");

      const response = await proxy(
        new NextRequest("https://sandbox.scontrinozero.it/"),
      );
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });
  });
});

describe("config.matcher", () => {
  it("non intercetta gli asset PWA sw.js e manifest.webmanifest", async () => {
    const { config } = await import("./proxy");
    const pattern = new RegExp(`^${config.matcher[0]}$`);

    // Esclusi: il proxy NON deve girare (niente redirect/getUser su SW e manifest).
    expect(pattern.test("/sw.js")).toBe(false);
    expect(pattern.test("/manifest.webmanifest")).toBe(false);
  });

  it("continua a intercettare le route applicative", async () => {
    const { config } = await import("./proxy");
    const pattern = new RegExp(`^${config.matcher[0]}$`);

    expect(pattern.test("/dashboard")).toBe(true);
    expect(pattern.test("/login")).toBe(true);
    expect(pattern.test("/")).toBe(true);
  });

  it("continua a escludere gli asset statici e le route già esenti", async () => {
    const { config } = await import("./proxy");
    const pattern = new RegExp(`^${config.matcher[0]}$`);

    expect(pattern.test("/logo.png")).toBe(false);
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
    expect(pattern.test("/api/health")).toBe(false);
  });
});
