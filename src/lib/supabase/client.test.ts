// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateBrowserClient = vi.fn().mockReturnValue({
  auth: { getUser: vi.fn() },
});
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mockCreateBrowserClient,
}));

describe("createBrowserSupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  });

  it("calls createBrowserClient with correct URL and key", async () => {
    const { createBrowserSupabaseClient } = await import("./client");
    createBrowserSupabaseClient();

    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key",
    );
  });

  it("returns a Supabase client instance", async () => {
    const { createBrowserSupabaseClient } = await import("./client");
    const client = createBrowserSupabaseClient();

    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});
