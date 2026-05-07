// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

const {
  mockGetAuthenticatedUser,
  mockGetStripe,
  mockGetDb,
  mockLimit,
  mockWhere,
  mockFrom,
  mockSelect,
  mockPortalSessionCreate,
  mockRateLimiterCheck,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockGetStripe: vi.fn(),
  mockGetDb: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockPortalSessionCreate: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockRateLimiterCheck };
  }),
  RATE_LIMIT_WINDOWS: { AUTH_15_MIN: 15 * 60 * 1000, HOURLY: 60 * 60 * 1000 },
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: mockGetStripe,
}));

vi.mock("@/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/db/schema", () => ({
  subscriptions: "subscriptions-table",
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { POST } from "@/app/api/stripe/portal/route";

// --- Helpers ---

function makeRequest(): Request {
  return new Request("http://localhost/api/stripe/portal", {
    method: "POST",
  });
}

// --- Tests ---

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_APP_URL = "https://test.scontrinozero.it";

    mockRateLimiterCheck.mockReturnValue({
      success: true,
      remaining: 9,
      resetAt: Date.now() + 3_600_000,
    });

    mockGetAuthenticatedUser.mockResolvedValue({
      id: "user-123",
      email: "user@example.com",
    });

    mockGetStripe.mockReturnValue({
      billingPortal: { sessions: { create: mockPortalSessionCreate } },
    });

    mockPortalSessionCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session/test",
    });

    // Default: user has an existing subscription with a customer ID
    mockGetDb.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([{ stripeCustomerId: "cus_existing_123" }]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthenticatedUser.mockRejectedValue(new Error("Not authenticated"));
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockRateLimiterCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    const response = await POST(makeRequest());
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("checks rate limit with per-user key", async () => {
    await POST(makeRequest());
    expect(mockRateLimiterCheck).toHaveBeenCalledWith("portal:user-123");
  });

  it("returns 400 when user has no Stripe customer (no active subscription)", async () => {
    mockLimit.mockResolvedValue([]);
    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when subscription row has no stripeCustomerId", async () => {
    mockLimit.mockResolvedValue([{ stripeCustomerId: null }]);
    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("creates a billing portal session with the correct customer and return_url", async () => {
    await POST(makeRequest());
    expect(mockPortalSessionCreate).toHaveBeenCalledWith({
      customer: "cus_existing_123",
      return_url: "https://test.scontrinozero.it/dashboard/settings",
    });
  });

  it("returns 200 with portal URL on success", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe("https://billing.stripe.com/session/test");
  });

  it("does not call Stripe when rate limit is exceeded", async () => {
    mockRateLimiterCheck.mockReturnValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    await POST(makeRequest());
    expect(mockPortalSessionCreate).not.toHaveBeenCalled();
  });

  it("uses localhost as fallback when NEXT_PUBLIC_APP_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    await POST(makeRequest());
    expect(mockPortalSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: "http://localhost:3000/dashboard/settings",
      }),
    );
  });

  describe("Stripe error handling", () => {
    it("returns 503 when billingPortal.sessions.create throws", async () => {
      mockPortalSessionCreate.mockRejectedValue(new Error("Stripe timeout"));
      const response = await POST(makeRequest());
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });
  });
});
