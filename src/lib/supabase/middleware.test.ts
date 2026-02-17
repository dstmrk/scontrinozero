// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreateServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

describe("createMiddlewareSupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";

    mockCreateServerClient.mockReturnValue({
      auth: { getUser: vi.fn() },
    });
  });

  it("creates a Supabase client with correct URL and key", async () => {
    const { createMiddlewareSupabaseClient } = await import("./middleware");
    const request = new NextRequest(new URL("http://localhost:3000/"));

    createMiddlewareSupabaseClient(request);

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );
  });

  it("getAll returns cookies from the request", async () => {
    const { createMiddlewareSupabaseClient } = await import("./middleware");
    const request = new NextRequest(new URL("http://localhost:3000/"));
    request.cookies.set("sb-token", "abc");

    createMiddlewareSupabaseClient(request);

    const cookiesConfig = mockCreateServerClient.mock.calls[0][2].cookies;
    const cookies = cookiesConfig.getAll();
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "sb-token", value: "abc" }),
      ]),
    );
  });

  it("setAll updates cookies on request and response", async () => {
    const { createMiddlewareSupabaseClient } = await import("./middleware");
    const request = new NextRequest(new URL("http://localhost:3000/"));

    const { response } = createMiddlewareSupabaseClient(request);

    const cookiesConfig = mockCreateServerClient.mock.calls[0][2].cookies;
    cookiesConfig.setAll([
      { name: "sb-token", value: "new-value", options: { path: "/" } },
    ]);

    // The response should have the updated cookie
    const res = response();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("sb-token=new-value");
  });

  it("returns a response function", async () => {
    const { createMiddlewareSupabaseClient } = await import("./middleware");
    const request = new NextRequest(new URL("http://localhost:3000/"));

    const { supabase, response } = createMiddlewareSupabaseClient(request);

    expect(supabase).toBeDefined();
    expect(typeof response).toBe("function");
    expect(response().status).toBe(200);
  });
});
