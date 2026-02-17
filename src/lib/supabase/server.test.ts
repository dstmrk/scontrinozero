// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
const mockGetAll = vi.fn().mockReturnValue([]);
const mockSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: mockGetAll,
    set: mockSet,
  }),
}));

// Mock @supabase/ssr
const mockSupabaseClient = { auth: { getUser: vi.fn() } };
const mockCreateServerClient = vi.fn().mockReturnValue(mockSupabaseClient);
vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

describe("createServerSupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  });

  it("creates a Supabase client with correct URL and key", async () => {
    const { createServerSupabaseClient } = await import("./server");
    await createServerSupabaseClient();

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

  it("getAll delegates to Next.js cookie store", async () => {
    const { createServerSupabaseClient } = await import("./server");
    await createServerSupabaseClient();

    const cookiesConfig = mockCreateServerClient.mock.calls[0][2].cookies;
    const fakeCookies = [{ name: "sb-token", value: "abc" }];
    mockGetAll.mockReturnValueOnce(fakeCookies);

    const result = cookiesConfig.getAll();
    expect(result).toEqual(fakeCookies);
  });

  it("setAll writes cookies to the Next.js cookie store", async () => {
    const { createServerSupabaseClient } = await import("./server");
    await createServerSupabaseClient();

    const cookiesConfig = mockCreateServerClient.mock.calls[0][2].cookies;
    cookiesConfig.setAll([
      { name: "sb-token", value: "abc", options: { path: "/" } },
      { name: "sb-refresh", value: "def", options: { path: "/" } },
    ]);

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledWith("sb-token", "abc", { path: "/" });
    expect(mockSet).toHaveBeenCalledWith("sb-refresh", "def", { path: "/" });
  });

  it("setAll does not throw when cookies.set fails (Server Component)", async () => {
    mockSet.mockImplementation(() => {
      throw new Error("Cannot set cookies in Server Component");
    });

    const { createServerSupabaseClient } = await import("./server");
    await createServerSupabaseClient();

    const cookiesConfig = mockCreateServerClient.mock.calls[0][2].cookies;

    expect(() =>
      cookiesConfig.setAll([
        { name: "sb-token", value: "abc", options: { path: "/" } },
      ]),
    ).not.toThrow();
  });
});
