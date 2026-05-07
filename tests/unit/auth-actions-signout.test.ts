// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const { mockSupabaseSignOut, mockRedirect } = vi.hoisted(() => ({
  mockSupabaseSignOut: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { signOut: mockSupabaseSignOut },
  }),
}));

// signOut does not use next/headers, but other modules imported by auth-actions
// may try to access it — provide a safe stub.
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ getAll: vi.fn().mockReturnValue([]) }),
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: vi.fn() };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { signOut } from "@/server/auth-actions";

describe("signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("chiama supabase.auth.signOut e reindirizza a /login", async () => {
    mockSupabaseSignOut.mockResolvedValue({});

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockSupabaseSignOut).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("reindirizza a /login anche se signOut ritorna un errore non critico", async () => {
    mockSupabaseSignOut.mockResolvedValue({ error: { message: "network" } });

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
