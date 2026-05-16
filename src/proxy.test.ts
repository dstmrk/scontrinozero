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

    it("P2-03: production: fail-closed redirects protected routes to /login when SUPABASE_URL missing", async () => {
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

    it("P2-03: production: public routes still pass through when SUPABASE_URL missing", async () => {
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

    it("ignores a spoofed Host header when nextUrl.hostname differs", async () => {
      const { proxy } = await import("./proxy");

      // The actual URL is on the marketing domain; an attacker-controlled Host
      // header claiming to be the app domain must not change routing decisions.
      const req = new NextRequest("https://scontrinozero.it/dashboard", {
        headers: { host: "app.scontrinozero.it" },
      });
      const response = await proxy(req);
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      // Decision is based on nextUrl.hostname (marketing) → redirect to app.
      expect(location.hostname).toBe("app.scontrinozero.it");
      expect(location.pathname).toBe("/dashboard");
    });
  });
});
