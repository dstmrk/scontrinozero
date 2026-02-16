// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock the middleware Supabase client
const mockGetUser = vi.fn();
let capturedResponse: NextResponse;
vi.mock("@/lib/supabase/middleware", () => ({
  createMiddlewareSupabaseClient: vi.fn().mockImplementation((request) => {
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

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("public routes", () => {
    it("allows unauthenticated access to /", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/"));
      expect(response.status).toBe(200);
    });

    it("allows unauthenticated access to /privacy", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/privacy"));
      expect(response.status).toBe(200);
    });

    it("allows authenticated access to /", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
      });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/"));
      expect(response.status).toBe(200);
    });
  });

  describe("protected routes — unauthenticated", () => {
    it("redirects /dashboard to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/dashboard"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe("/dashboard");
    });

    it("redirects /dashboard/settings to /login with redirect param", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/dashboard/settings"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe("/dashboard/settings");
    });

    it("redirects /onboarding to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/onboarding"));
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
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/dashboard"));
      expect(response.status).toBe(200);
    });

    it("allows authenticated access to /onboarding", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/onboarding"));
      expect(response.status).toBe(200);
    });
  });

  describe("auth-only routes — redirect if authenticated", () => {
    it("redirects /login to /dashboard when authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/login"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/dashboard");
    });

    it("redirects /register to /dashboard when authenticated", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/register"));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/dashboard");
    });

    it("allows unauthenticated access to /login", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const { middleware } = await import("./middleware");

      const response = await middleware(createRequest("/login"));
      expect(response.status).toBe(200);
    });
  });
});
