// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateClient = vi.fn().mockReturnValue({ auth: { admin: {} } });
vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

describe("createAdminSupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test-key";
  });

  it("creates a client with the correct URL and service key", async () => {
    const { createAdminSupabaseClient } = await import("./admin");
    createAdminSupabaseClient();

    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "sb_secret_test-key",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { createAdminSupabaseClient } = await import("./admin");

    expect(() => createAdminSupabaseClient()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required",
    );
  });

  it("throws when SUPABASE_SECRET_KEY is missing", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const { createAdminSupabaseClient } = await import("./admin");

    expect(() => createAdminSupabaseClient()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required",
    );
  });
});
