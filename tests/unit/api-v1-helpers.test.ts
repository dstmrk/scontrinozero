// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

// --- Mocks ---

const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockReadJsonWithLimit,
  mockLoggerWarn,
  mockRateLimiterCheck,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn(),
  mockIsApiKeyAuthError: vi.fn(),
  mockCanUseApi: vi.fn(),
  mockReadJsonWithLimit: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockRateLimiterCheck: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/lib/request-utils", () => ({
  readJsonWithLimit: mockReadJsonWithLimit,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn() },
}));

// --- Import module under test ---

import {
  requireBusinessApiAuth,
  corsOptionsResponse,
  checkRateLimitApi,
  parseAndValidateBody,
  withCors,
} from "@/lib/api-v1-helpers";

// --- Helpers ---

function makeRequest(): Request {
  return new Request("https://example.com/api/v1/test");
}

const PRO_AUTH_CONTEXT = {
  plan: "pro",
  businessId: "biz-123",
  apiKey: { id: "key-1" },
  profileId: "profile-1",
  trialStartedAt: null,
};

// Fake RateLimiter instance (duck-typed)
function makeLimiter(success: boolean, resetAt = Date.now() + 3600_000) {
  return {
    check: mockRateLimiterCheck.mockReturnValue({
      success,
      remaining: 0,
      resetAt,
    }),
  };
}

// --- Tests ---

describe("requireBusinessApiAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockAuthenticateApiKey.mockResolvedValue(PRO_AUTH_CONTEXT);
    mockCanUseApi.mockReturnValue(true);
  });

  it("returns 401 when auth fails", async () => {
    mockIsApiKeyAuthError.mockReturnValue(true);
    mockAuthenticateApiKey.mockResolvedValue({
      error: "Unauthorized",
      status: 401,
    });
    const result = await requireBusinessApiAuth(makeRequest());
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(401);
      expect(result.error.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("returns 402 when plan does not include API access", async () => {
    mockCanUseApi.mockReturnValue(false);
    const result = await requireBusinessApiAuth(makeRequest());
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(402);
      expect(result.error.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("returns 403 when businessId is null (management key)", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      ...PRO_AUTH_CONTEXT,
      businessId: null,
    });
    const result = await requireBusinessApiAuth(makeRequest());
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
      expect(result.error.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("returns context when auth succeeds", async () => {
    const result = await requireBusinessApiAuth(makeRequest());
    expect("context" in result).toBe(true);
    if ("context" in result) {
      expect(result.context.businessId).toBe("biz-123");
      expect(result.context.apiKey.id).toBe("key-1");
    }
  });
});

describe("corsOptionsResponse", () => {
  it("returns 204 with correct CORS headers for POST", () => {
    const res = corsOptionsResponse("POST, OPTIONS");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
  });

  it("returns 204 with correct CORS headers for GET", () => {
    const res = corsOptionsResponse("GET, OPTIONS");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
  });
});

describe("withCors", () => {
  it("adds Access-Control-Allow-Origin header to an existing response", () => {
    const original = Response.json({ ok: true }, { status: 200 });
    const result = withCors(original);
    expect(result.status).toBe(200);
    expect(result.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("preserves the original response status and body", async () => {
    const original = Response.json({ id: "abc" }, { status: 201 });
    const result = withCors(original);
    expect(result.status).toBe(201);
    const body = await result.json();
    expect(body).toEqual({ id: "abc" });
  });

  it("preserves existing headers on the response", () => {
    const original = new Response(null, {
      status: 204,
      headers: { "X-Custom": "value" },
    });
    const result = withCors(original);
    expect(result.headers.get("X-Custom")).toBe("value");
    expect(result.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("checkRateLimitApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when rate limit is not exceeded", () => {
    const limiter = makeLimiter(true) as unknown as Parameters<
      typeof checkRateLimitApi
    >[0];
    const result = checkRateLimitApi(limiter, "key", "api-key-id", "log msg");
    expect(result).toBeNull();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("returns 429 Response when rate limit is exceeded", () => {
    const limiter = makeLimiter(false) as unknown as Parameters<
      typeof checkRateLimitApi
    >[0];
    const result = checkRateLimitApi(limiter, "key", "api-key-id", "log msg");
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  it("includes Access-Control-Allow-Origin header on 429", () => {
    const limiter = makeLimiter(false) as unknown as Parameters<
      typeof checkRateLimitApi
    >[0];
    const result = checkRateLimitApi(limiter, "key", "api-key-id", "log msg");
    expect(result?.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("includes Retry-After header with a positive integer on 429", () => {
    const resetAt = Date.now() + 30_000; // 30s from now
    const limiter = {
      check: mockRateLimiterCheck.mockReturnValue({
        success: false,
        remaining: 0,
        resetAt,
      }),
    } as unknown as Parameters<typeof checkRateLimitApi>[0];
    const result = checkRateLimitApi(limiter, "key", "api-key-id", "log msg");
    const retryAfter = result?.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    const seconds = Number(retryAfter);
    expect(Number.isInteger(seconds)).toBe(true);
    expect(seconds).toBeGreaterThanOrEqual(1);
  });

  it("Retry-After is at least 1 even when resetAt is in the past", () => {
    const resetAt = Date.now() - 1000; // already expired
    const limiter = {
      check: mockRateLimiterCheck.mockReturnValue({
        success: false,
        remaining: 0,
        resetAt,
      }),
    } as unknown as Parameters<typeof checkRateLimitApi>[0];
    const result = checkRateLimitApi(limiter, "key", "api-key-id", "log msg");
    const seconds = Number(result?.headers.get("Retry-After"));
    expect(seconds).toBe(1);
  });

  it("logs a warning with apiKeyId when rate limit is exceeded", () => {
    const limiter = makeLimiter(false) as unknown as Parameters<
      typeof checkRateLimitApi
    >[0];
    checkRateLimitApi(
      limiter,
      "api:emit:key-1",
      "key-1",
      "rate limit exceeded",
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { apiKeyId: "key-1" },
      "rate limit exceeded",
    );
  });
});

describe("parseAndValidateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 413 when body exceeds size limit", async () => {
    mockReadJsonWithLimit.mockResolvedValue({ ok: false, tooLarge: true });
    const result = await parseAndValidateBody(makeRequest(), schema, 1024);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(413);
      expect(result.error.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("returns 400 when body is not valid JSON", async () => {
    mockReadJsonWithLimit.mockResolvedValue({ ok: false, parseError: true });
    const result = await parseAndValidateBody(makeRequest(), schema, 1024);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.error).toContain("Body non valido");
      expect(result.error.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("returns 400 with field name when Zod validation fails on a named field", async () => {
    mockReadJsonWithLimit.mockResolvedValue({ ok: true, data: { name: "" } });
    const result = await parseAndValidateBody(makeRequest(), schema, 1024);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.error).toContain("name");
      expect(result.error.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("returns 400 when required field is missing", async () => {
    mockReadJsonWithLimit.mockResolvedValue({ ok: true, data: {} });
    const result = await parseAndValidateBody(makeRequest(), schema, 1024);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  it("returns parsed data on success", async () => {
    mockReadJsonWithLimit.mockResolvedValue({
      ok: true,
      data: { name: "Caffè" },
    });
    const result = await parseAndValidateBody(makeRequest(), schema, 1024);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data).toEqual({ name: "Caffè" });
    }
  });
});
