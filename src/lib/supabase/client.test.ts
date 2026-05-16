// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

  it("throws with actionable message when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { createBrowserSupabaseClient } = await import("./client");

    expect(() => createBrowserSupabaseClient()).toThrow(
      /missing NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(mockCreateBrowserClient).not.toHaveBeenCalled();
  });

  it("throws with actionable message when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const { createBrowserSupabaseClient } = await import("./client");

    expect(() => createBrowserSupabaseClient()).toThrow(
      /missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
    expect(mockCreateBrowserClient).not.toHaveBeenCalled();
  });

  it("lists both vars when both are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const { createBrowserSupabaseClient } = await import("./client");

    expect(() => createBrowserSupabaseClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });
});
