/**
 * Shared helpers for /api/v1/* route handlers.
 *
 * Centralises the four patterns that appear in every v1 route:
 *   1. Auth + plan gate + business key check
 *   2. CORS preflight (OPTIONS)
 *   3. Rate limit check
 *   4. Request body parsing + Zod validation
 */
import { authenticateApiKey, isApiKeyAuthError } from "@/lib/api-auth";
import type { ApiKeyContext } from "@/lib/api-auth";
import { dbTimeoutResponse } from "@/lib/api-errors";
import { canUseApi } from "@/lib/plans";
import { logger } from "@/lib/logger";
import { readJsonWithLimit } from "@/lib/request-utils";
import type { RateLimiter } from "@/lib/rate-limit";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import type { ZodType } from "zod/v4";

/** ApiKeyContext with businessId narrowed to string (management keys excluded). */
export type BusinessApiContext = Omit<ApiKeyContext, "businessId"> & {
  businessId: string;
};

/**
 * CORS headers included on every /api/v1/* response (not only preflight).
 * Authentication is via Bearer token, not cookies, so the wildcard origin
 * is intentional and safe for this public developer API.
 */
// NOSONAR — developer API: auth via Bearer token (not cookies), wildcard is intentional
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
} as const;

/**
 * Returns a new Response with CORS headers added.
 * Use this to add CORS headers to success responses in route handlers.
 */
export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Access-Control-Allow-Origin",
    CORS_HEADERS["Access-Control-Allow-Origin"],
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Runs auth, plan gate, and business key checks common to all v1 API routes.
 *
 * Returns `{ error: Response }` on any failure so the caller can do:
 *   if ("error" in result) return result.error;
 */
export async function requireBusinessApiAuth(
  request: Request,
): Promise<{ error: Response } | { context: BusinessApiContext }> {
  const auth = await authenticateApiKey(request);
  if (isApiKeyAuthError(auth)) {
    // 503: DB sovraccarico durante l'auth lookup. Risposta retryable con
    // `Retry-After` e `code: DB_TIMEOUT`, coerente con i timeout sulle read
    // route v1 (cfr. dbTimeoutResponse).
    if (auth.status === 503) {
      return { error: withCors(dbTimeoutResponse()) };
    }
    return {
      error: Response.json(
        { error: auth.error },
        { status: auth.status, headers: CORS_HEADERS },
      ),
    };
  }

  if (!canUseApi(auth.plan)) {
    return {
      error: Response.json(
        {
          error:
            "Il tuo piano non include l'accesso alle API. Passa al piano Pro o Developer.",
        },
        { status: 402, headers: CORS_HEADERS },
      ),
    };
  }

  if (!auth.businessId) {
    return {
      error: Response.json(
        { error: "Questa API richiede una business key (szk_live_)." },
        { status: 403, headers: CORS_HEADERS },
      ),
    };
  }

  return { context: auth as BusinessApiContext };
}

/**
 * Returns a 204 CORS preflight response.
 *
 * @param methods - Comma-separated HTTP methods, e.g. "POST, OPTIONS"
 */
export function corsOptionsResponse(methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*", // NOSONAR — developer API: auth via Bearer token (not cookies), wildcard is intentional
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

/**
 * Checks rate limit and returns a 429 Response if exceeded, null otherwise.
 * The response includes a `Retry-After` header (seconds) for machine-readable backoff.
 *
 * @param limiter  - RateLimiter instance (module-level singleton in the route)
 * @param key      - Rate limit bucket key, e.g. "api:emit:<apiKeyId>"
 * @param apiKeyId - Used in the warning log only
 * @param logMsg   - Log message distinguishing the operation (emit vs void, etc.)
 */
export function checkRateLimitApi(
  limiter: RateLimiter,
  key: string,
  apiKeyId: string,
  logMsg: string,
): Response | null {
  const result = limiter.check(key);
  if (!result.success) {
    logger.warn({ apiKeyId }, logMsg);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    );
    return Response.json(
      { error: ERROR_MESSAGES.RATE_LIMIT_API_HOURS },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }
  return null;
}

/**
 * Reads and validates the request body against a Zod schema.
 *
 * Returns `{ error: Response }` on size/parse/validation failure,
 * or `{ data: T }` on success.
 *
 * @param request  - Incoming request
 * @param schema   - Zod schema to validate against
 * @param maxBytes - Maximum allowed body size in bytes
 */
export async function parseAndValidateBody<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes: number,
): Promise<{ error: Response } | { data: T }> {
  const bodyResult = await readJsonWithLimit(request, maxBytes);
  if (!bodyResult.ok) {
    return {
      error:
        "tooLarge" in bodyResult
          ? Response.json(
              { error: "Payload troppo grande." },
              { status: 413, headers: CORS_HEADERS },
            )
          : Response.json(
              { error: "Body non valido." },
              { status: 400, headers: CORS_HEADERS },
            ),
    };
  }

  const parsed = schema.safeParse(bodyResult.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.join(".");
    const msg = field
      ? `Il campo '${field}' non è valido: ${issue.message}`
      : (issue?.message ?? "Input non valido.");
    return {
      error: Response.json(
        { error: msg },
        { status: 400, headers: CORS_HEADERS },
      ),
    };
  }

  return { data: parsed.data };
}
