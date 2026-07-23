// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import type { RateLimiter } from "@/lib/rate-limit";

// vi.hoisted: the factory below is hoisted above these declarations, so the
// mock fns must be hoisted too (regola testing-patterns). Typed with the real
// module signatures (regola 16: no `...args` spread).
const {
  mockAuthenticateApiKey,
  mockIsApiKeyAuthError,
  mockCanUseApi,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockAuthenticateApiKey: vi.fn<(request: Request) => Promise<unknown>>(),
  mockIsApiKeyAuthError: vi.fn<(value: unknown) => boolean>(),
  mockCanUseApi: vi.fn<(plan: string) => boolean>(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  isApiKeyAuthError: mockIsApiKeyAuthError,
}));

vi.mock("@/lib/plans", () => ({
  canUseApi: mockCanUseApi,
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn },
}));

import {
  checkRateLimitApi,
  corsOptionsResponse,
  parseAndValidateBody,
  requireBusinessApiAuth,
  serviceErrorResponse,
  withCors,
} from "./api-v1-helpers";

const ORIGIN_HEADER = "Access-Control-Allow-Origin";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withCors", () => {
  it("adds the wildcard CORS origin while preserving status and body", async () => {
    const res = withCors(
      Response.json({ ok: true }, { status: 201, statusText: "Created" }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("requireBusinessApiAuth", () => {
  function makeRequest(): Request {
    return new Request("https://api.example.com/v1/receipts", {
      method: "POST",
    });
  }

  it("returns a retryable DB timeout response when auth lookup hits 503", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      error: "overloaded",
      status: 503,
    });
    mockIsApiKeyAuthError.mockReturnValue(true);

    const result = await requireBusinessApiAuth(makeRequest());

    expect("error" in result).toBe(true);
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(503);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(await res.json()).toMatchObject({ code: "DB_TIMEOUT" });
  });

  it("forwards the auth error status (e.g. 401) with CORS headers", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      error: "API key non valida.",
      status: 401,
    });
    mockIsApiKeyAuthError.mockReturnValue(true);

    const result = await requireBusinessApiAuth(makeRequest());
    const res = (result as { error: Response }).error;

    expect(res.status).toBe(401);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(await res.json()).toEqual({ error: "API key non valida." });
  });

  it("returns 402 when the plan does not include API access", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "starter",
      businessId: "biz-1",
    });
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockCanUseApi.mockReturnValue(false);

    const result = await requireBusinessApiAuth(makeRequest());
    const res = (result as { error: Response }).error;

    expect(res.status).toBe(402);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
  });

  it("returns 403 when the key is not a business key (businessId null)", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "pro",
      businessId: null,
    });
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockCanUseApi.mockReturnValue(true);

    const result = await requireBusinessApiAuth(makeRequest());
    const res = (result as { error: Response }).error;

    expect(res.status).toBe(403);
  });

  it("returns the context on success", async () => {
    const context = { plan: "pro", businessId: "biz-42", apiKeyId: "k1" };
    mockAuthenticateApiKey.mockResolvedValue(context);
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockCanUseApi.mockReturnValue(true);

    const result = await requireBusinessApiAuth(makeRequest());

    expect(result).toEqual({ context });
  });
});

describe("corsOptionsResponse", () => {
  it("returns a 204 preflight with the requested methods", () => {
    const res = corsOptionsResponse("POST, OPTIONS");
    expect(res.status).toBe(204);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization, Content-Type",
    );
  });
});

describe("checkRateLimitApi", () => {
  function makeLimiter(result: {
    success: boolean;
    resetAt?: number;
  }): RateLimiter {
    return {
      check: vi.fn(() => ({
        success: result.success,
        remaining: 0,
        resetAt: result.resetAt ?? 0,
      })),
    } as unknown as RateLimiter;
  }

  it("returns null when the request is within the limit", () => {
    const res = checkRateLimitApi(
      makeLimiter({ success: true }),
      "api:emit:k1",
      "k1",
      "emit rate limited",
    );
    expect(res).toBeNull();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("returns 429 with a Retry-After header and logs a warning", () => {
    const resetAt = Date.now() + 30_000;
    const res = checkRateLimitApi(
      makeLimiter({ success: false, resetAt }),
      "api:emit:k1",
      "k1",
      "emit rate limited",
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    expect(res?.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThanOrEqual(29);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { apiKeyId: "k1" },
      "emit rate limited",
    );
  });

  it("floors Retry-After to at least 1 second when resetAt is in the past", () => {
    const res = checkRateLimitApi(
      makeLimiter({ success: false, resetAt: Date.now() - 5_000 }),
      "api:emit:k1",
      "k1",
      "emit rate limited",
    );
    expect(res?.headers.get("Retry-After")).toBe("1");
  });
});

describe("serviceErrorResponse", () => {
  it("maps a known code with a Retry-After (DB_TIMEOUT → 503)", async () => {
    const res = serviceErrorResponse({
      error: "overloaded",
      code: "DB_TIMEOUT",
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(await res.json()).toEqual({
      code: "DB_TIMEOUT",
      error: "overloaded",
    });
  });

  it("maps a known code without a Retry-After (ALREADY_REJECTED → 409)", () => {
    const res = serviceErrorResponse({
      error: "già annullato",
      code: "ALREADY_REJECTED",
    });
    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("maps PENDING_IN_PROGRESS to 409 with Retry-After 2", () => {
    const res = serviceErrorResponse({
      error: "in corso",
      code: "PENDING_IN_PROGRESS",
    });
    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBe("2");
  });

  it("maps NOT_FOUND to 404 with the code in the body", async () => {
    const res = serviceErrorResponse({
      error: "Scontrino non trovato.",
      code: "NOT_FOUND",
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(await res.json()).toEqual({
      code: "NOT_FOUND",
      error: "Scontrino non trovato.",
    });
  });

  it("falls back to 422 for an unknown code", async () => {
    const res = serviceErrorResponse({ error: "boom", code: "WHAT_IS_THIS" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "boom" });
  });

  it("falls back to 422 when no code is provided (no code field in body)", async () => {
    const res = serviceErrorResponse({ error: "boom" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("parseAndValidateBody", () => {
  const schema = z.object({ foo: z.string() });

  function jsonRequest(body: string): Request {
    return new Request("https://api.example.com/v1/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  it("returns 413 when the body exceeds the size limit", async () => {
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify({ foo: "x".repeat(100) })),
      schema,
      10,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(413);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(await res.json()).toEqual({ error: "Payload troppo grande." });
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const result = await parseAndValidateBody(
      jsonRequest("{not json"),
      schema,
      1000,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body non valido." });
  });

  it("returns 400 with the field name when validation fails on a known path", async () => {
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify({ foo: 123 })),
      schema,
      1000,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Il campo 'foo' non è valido");
  });

  it("returns 400 with the raw message when the failure has no field path", async () => {
    const rootSchema = z.string();
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify(123)),
      rootSchema,
      1000,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain("Il campo");
  });

  it("returns the parsed data on success", async () => {
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify({ foo: "bar" })),
      schema,
      1000,
    );
    expect(result).toEqual({ data: { foo: "bar" } });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
