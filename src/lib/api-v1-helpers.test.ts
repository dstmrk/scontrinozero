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
  ADE_REAUTH_REQUIRED_MESSAGE,
  checkRateLimitApi,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  parseAndValidateBody,
  parseListPagination,
  requireBusinessApiAuth,
  serviceErrorResponse,
} from "./api-v1-helpers";
import { REQUEST_ID_HEADER } from "./api-v1-errors";

const ORIGIN_HEADER = "Access-Control-Allow-Origin";
const REQUEST_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  vi.clearAllMocks();
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

    const result = await requireBusinessApiAuth(makeRequest(), REQUEST_ID);

    expect("error" in result).toBe(true);
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(503);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(await res.json()).toEqual({
      code: "DB_TIMEOUT",
      message: "overloaded",
      requestId: REQUEST_ID,
    });
  });

  it("maps a 401 auth failure to UNAUTHORIZED with the envelope", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      error: "API key non valida.",
      status: 401,
    });
    mockIsApiKeyAuthError.mockReturnValue(true);

    const result = await requireBusinessApiAuth(makeRequest(), REQUEST_ID);
    const res = (result as { error: Response }).error;

    expect(res.status).toBe(401);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);
    expect(await res.json()).toEqual({
      code: "UNAUTHORIZED",
      message: "API key non valida.",
      requestId: REQUEST_ID,
    });
  });

  it("returns 402 PLAN_UPGRADE_REQUIRED when the plan does not include API access", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "starter",
      businessId: "biz-1",
    });
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockCanUseApi.mockReturnValue(false);

    const result = await requireBusinessApiAuth(makeRequest(), REQUEST_ID);
    const res = (result as { error: Response }).error;

    expect(res.status).toBe(402);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(await res.json()).toMatchObject({ code: "PLAN_UPGRADE_REQUIRED" });
  });

  it("returns 403 BUSINESS_KEY_REQUIRED when the key is not a business key", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      plan: "pro",
      businessId: null,
    });
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockCanUseApi.mockReturnValue(true);

    const result = await requireBusinessApiAuth(makeRequest(), REQUEST_ID);
    const res = (result as { error: Response }).error;

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "BUSINESS_KEY_REQUIRED" });
  });

  it("returns the context on success", async () => {
    const context = { plan: "pro", businessId: "biz-42", apiKeyId: "k1" };
    mockAuthenticateApiKey.mockResolvedValue(context);
    mockIsApiKeyAuthError.mockReturnValue(false);
    mockCanUseApi.mockReturnValue(true);

    const result = await requireBusinessApiAuth(makeRequest(), REQUEST_ID);

    expect(result).toEqual({ context });
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
      REQUEST_ID,
    );
    expect(res).toBeNull();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMIT_EXCEEDED with Retry-After and logs the requestId", async () => {
    const resetAt = Date.now() + 30_000;
    const res = checkRateLimitApi(
      makeLimiter({ success: false, resetAt }),
      "api:emit:k1",
      "k1",
      "emit rate limited",
      REQUEST_ID,
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    expect(res?.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThanOrEqual(29);
    expect(await res?.json()).toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
      requestId: REQUEST_ID,
    });
    // requestId nel log: è il filo fra la risposta all'utente e la nostra riga.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { apiKeyId: "k1", requestId: REQUEST_ID },
      "emit rate limited",
    );
  });

  it("floors Retry-After to at least 1 second when resetAt is in the past", () => {
    const res = checkRateLimitApi(
      makeLimiter({ success: false, resetAt: Date.now() - 5_000 }),
      "api:emit:k1",
      "k1",
      "emit rate limited",
      REQUEST_ID,
    );
    expect(res?.headers.get("Retry-After")).toBe("1");
  });
});

describe("serviceErrorResponse", () => {
  it("maps a known code with a Retry-After (DB_TIMEOUT → 503)", async () => {
    const res = serviceErrorResponse(
      { error: "overloaded", code: "DB_TIMEOUT" },
      REQUEST_ID,
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(await res.json()).toEqual({
      code: "DB_TIMEOUT",
      message: "overloaded",
      requestId: REQUEST_ID,
    });
  });

  it("maps a known code without a Retry-After (ALREADY_REJECTED → 409)", () => {
    const res = serviceErrorResponse(
      { error: "già rifiutato", code: "ALREADY_REJECTED" },
      REQUEST_ID,
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBeNull();
  });

  it("maps PENDING_IN_PROGRESS to 409 with Retry-After 2", () => {
    const res = serviceErrorResponse(
      { error: "in corso", code: "PENDING_IN_PROGRESS" },
      REQUEST_ID,
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBe("2");
  });

  it("maps NOT_FOUND to 404 with the code in the body", async () => {
    const res = serviceErrorResponse(
      { error: "Scontrino non trovato.", code: "NOT_FOUND" },
      REQUEST_ID,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(await res.json()).toEqual({
      code: "NOT_FOUND",
      message: "Scontrino non trovato.",
      requestId: REQUEST_ID,
    });
  });

  it("maps ADE_REAUTH_REQUIRED to 409 with the code and no Retry-After", async () => {
    const res = serviceErrorResponse(
      { error: ADE_REAUTH_REQUIRED_MESSAGE, code: "ADE_REAUTH_REQUIRED" },
      REQUEST_ID,
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(await res.json()).toEqual({
      code: "ADE_REAUTH_REQUIRED",
      message: ADE_REAUTH_REQUIRED_MESSAGE,
      requestId: REQUEST_ID,
    });
  });

  it("maps ADE_UNAVAILABLE to a retryable 503 with Retry-After", async () => {
    const res = serviceErrorResponse(
      { error: "AdE non raggiungibile", code: "ADE_UNAVAILABLE" },
      REQUEST_ID,
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("10");
    expect(await res.json()).toMatchObject({ code: "ADE_UNAVAILABLE" });
  });

  it("maps ADE_PASSWORD_EXPIRED to 409 (azione umana, nessun retry)", async () => {
    const res = serviceErrorResponse(
      { error: "password scaduta", code: "ADE_PASSWORD_EXPIRED" },
      REQUEST_ID,
    );
    expect(res.status).toBe(409);
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(await res.json()).toMatchObject({ code: "ADE_PASSWORD_EXPIRED" });
  });

  it("falls back to ADE_REJECTED (422) for an unknown code", async () => {
    const res = serviceErrorResponse(
      { error: "boom", code: "WHAT_IS_THIS" },
      REQUEST_ID,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      code: "ADE_REJECTED",
      message: "boom",
      requestId: REQUEST_ID,
    });
  });

  it("falls back to ADE_REJECTED (422) when no code is provided", async () => {
    const res = serviceErrorResponse({ error: "boom" }, REQUEST_ID);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "ADE_REJECTED" });
  });

  it("non risolve chiavi ereditate da Object.prototype (prototype pollution)", async () => {
    const res = serviceErrorResponse(
      { error: "boom", code: "constructor" },
      REQUEST_ID,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "ADE_REJECTED" });
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

  it("returns 413 PAYLOAD_TOO_LARGE when the body exceeds the size limit", async () => {
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify({ foo: "x".repeat(100) })),
      schema,
      10,
      REQUEST_ID,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(413);
    expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
    expect(await res.json()).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: "Payload troppo grande.",
      requestId: REQUEST_ID,
    });
  });

  it("returns 400 INVALID_BODY when the body is not valid JSON", async () => {
    const result = await parseAndValidateBody(
      jsonRequest("{not json"),
      schema,
      1000,
      REQUEST_ID,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "INVALID_BODY",
      message: "Body non valido.",
      requestId: REQUEST_ID,
    });
  });

  it("returns 400 VALIDATION_ERROR with the field name on a known path", async () => {
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify({ foo: 123 })),
      schema,
      1000,
      REQUEST_ID,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("Il campo 'foo' non è valido");
  });

  it("returns 400 with the raw message when the failure has no field path", async () => {
    const rootSchema = z.string();
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify(123)),
      rootSchema,
      1000,
      REQUEST_ID,
    );
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).not.toContain("Il campo");
  });

  it("returns the parsed data on success", async () => {
    const result = await parseAndValidateBody(
      jsonRequest(JSON.stringify({ foo: "bar" })),
      schema,
      1000,
      REQUEST_ID,
    );
    expect(result).toEqual({ data: { foo: "bar" } });
  });
});

describe("parseListPagination", () => {
  function params(query: string): URLSearchParams {
    return new URLSearchParams(query);
  }

  it("returns the documented defaults when no params are present", () => {
    const result = parseListPagination(params(""), REQUEST_ID);
    expect(result).toEqual({
      data: { page: 1, limit: LIST_DEFAULT_LIMIT, kind: null },
    });
  });

  it("parses valid page/limit/kind", () => {
    const result = parseListPagination(
      params("page=2&limit=50&kind=SALE"),
      REQUEST_ID,
    );
    expect(result).toEqual({ data: { page: 2, limit: 50, kind: "SALE" } });
  });

  it("accepts kind=VOID", () => {
    const result = parseListPagination(params("kind=VOID"), REQUEST_ID);
    expect(result).toEqual({
      data: { page: 1, limit: LIST_DEFAULT_LIMIT, kind: "VOID" },
    });
  });

  it("accepts limit at the maximum", () => {
    const result = parseListPagination(
      params(`limit=${LIST_MAX_LIMIT}`),
      REQUEST_ID,
    );
    expect(result).toEqual({
      data: { page: 1, limit: LIST_MAX_LIMIT, kind: null },
    });
  });

  it("caps a valid limit above the maximum down to LIST_MAX_LIMIT (soft cap, not 400)", () => {
    const result = parseListPagination(
      params(`limit=${LIST_MAX_LIMIT + 400}`),
      REQUEST_ID,
    );
    expect(result).toEqual({
      data: { page: 1, limit: LIST_MAX_LIMIT, kind: null },
    });
  });

  it.each([
    { name: "page=abc (non numeric)", query: "page=abc", field: "page" },
    { name: "page=12abc (numeric prefix)", query: "page=12abc", field: "page" },
    { name: "page=-100 (negative)", query: "page=-100", field: "page" },
    { name: "page=0 (below min)", query: "page=0", field: "page" },
    { name: "page=1.5 (non integer)", query: "page=1.5", field: "page" },
    { name: "page= (empty)", query: "page=", field: "page" },
    { name: "limit=-1 (negative)", query: "limit=-1", field: "limit" },
    { name: "limit=0 (below min)", query: "limit=0", field: "limit" },
    { name: "limit=abc (non numeric)", query: "limit=abc", field: "limit" },
    { name: "kind=FOO (invalid enum)", query: "kind=FOO", field: "kind" },
  ])(
    "rejects $name with a 400 INVALID_QUERY_PARAM mentioning the field",
    async ({ query, field }) => {
      const result = parseListPagination(params(query), REQUEST_ID);
      expect("error" in result).toBe(true);
      const res = (result as { error: Response }).error;
      expect(res.status).toBe(400);
      expect(res.headers.get(ORIGIN_HEADER)).toBe("*");
      const body = (await res.json()) as { code: string; message: string };
      expect(body.code).toBe("INVALID_QUERY_PARAM");
      expect(body.message).toContain(`'${field}'`);
    },
  );

  it("reports only the first invalid param when several are wrong", async () => {
    const result = parseListPagination(params("page=abc&kind=FOO"), REQUEST_ID);
    const res = (result as { error: Response }).error;
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("'page'");
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
