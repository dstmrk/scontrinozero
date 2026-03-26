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

  describe("Supabase not configured", () => {
    it("passes through all routes when NEXT_PUBLIC_SUPABASE_URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      vi.resetModules();
      const { proxy } = await import("./proxy");

      // Even protected routes should pass through
      const response = await proxy(createRequest("/dashboard"));
      expect(response.status).toBe(200);
      expect(mockGetUser).not.toHaveBeenCalled();
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
  });
});
