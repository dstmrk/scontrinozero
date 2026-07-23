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
import { z, type ZodType } from "zod/v4";

/**
 * Messaggio del 409 quando la sessione AdE interattiva (CIE) è scaduta: va
 * rinnovata dall'app web (secondo fattore umano), il retry automatico via API
 * è inutile finché l'utente non si ricollega. Condiviso da POST /v1/receipts e
 * POST /v1/receipts/{id}/void per evitare la duplicazione del body inline.
 */
export const ADE_REAUTH_REQUIRED_MESSAGE =
  "Sessione AdE (CIE) scaduta: ricollegati dall'app web ScontrinoZero prima di riprovare.";

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

  if (!canUseApi(auth.plan, auth.planExpiresAt)) {
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
 * Maps service error codes (`emitReceiptForBusiness`, `voidReceiptForBusiness`)
 * to HTTP responses. Centralised so route handlers don't repeat the same
 * status/Retry-After mapping (SonarCloud duplicated-lines guard).
 *
 * Fallback (unknown / undefined code): 422 with `{ error }` envelope.
 */
const SERVICE_ERROR_STATUS_MAP: Record<
  string,
  { status: number; retryAfter?: number }
> = {
  DB_TIMEOUT: { status: 503, retryAfter: 5 },
  PENDING_IN_PROGRESS: { status: 409, retryAfter: 2 },
  ALREADY_REJECTED: { status: 409 },
  ALREADY_VOIDED: { status: 409 },
  VOID_PENDING_IN_PROGRESS: { status: 409, retryAfter: 2 },
  VOID_ALREADY_TARGETED: { status: 409 },
  VOID_SYNC_FAILED: { status: 500 },
  IDEMPOTENCY_PAYLOAD_MISMATCH: { status: 409 },
  // Sessione AdE interattiva (CIE) scaduta: 409 senza Retry-After — il retry
  // automatico è inutile finché l'utente non si ricollega dall'app web.
  ADE_REAUTH_REQUIRED: { status: 409 },
  // Documento inesistente / cross-tenant: 404, coerente con GET /v1/receipts/{id}
  // (che risponde 404 direttamente nella route). Prima cadeva nel fallback 422.
  NOT_FOUND: { status: 404 },
};

export function serviceErrorResponse(result: {
  error: string;
  code?: string;
}): Response {
  const mapping = result.code
    ? SERVICE_ERROR_STATUS_MAP[result.code]
    : undefined;
  if (!mapping) {
    return withCors(Response.json({ error: result.error }, { status: 422 }));
  }
  const init: ResponseInit = { status: mapping.status };
  if (mapping.retryAfter !== undefined) {
    init.headers = { "Retry-After": String(mapping.retryAfter) };
  }
  return withCors(
    Response.json({ code: result.code, error: result.error }, init),
  );
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

/** Page size di default per GET /api/v1/receipts (nessun `limit` in query). */
export const LIST_DEFAULT_LIMIT = 20;
/** Page size massimo per GET /api/v1/receipts. */
export const LIST_MAX_LIMIT = 100;

// `z.coerce.number().int()` rifiuta NaN/Infinity (Number.isInteger è false) e i
// non-interi: "abc"/"12abc"/"1.5"/"Infinity" → 400. `.min(1)` copre 0 e i
// negativi ("-100", "0", "" → Number("")=0). Assenti → default nel chiamante.
// Nota: nessun `.max()` su `limit` — un `limit` oltre il massimo NON è un errore
// ma viene *ridotto* a LIST_MAX_LIMIT nel return (soft cap convenzionale). Solo
// i valori malformati (non interi, < 1) sono rifiutati con 400.
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  kind: z.enum(["SALE", "VOID"]).optional(),
});

const LIST_QUERY_ERROR: Record<string, string> = {
  page: "Il parametro 'page' deve essere un intero maggiore o uguale a 1.",
  limit: "Il parametro 'limit' deve essere un intero maggiore o uguale a 1.",
  kind: "Il parametro 'kind' deve essere 'SALE' o 'VOID'.",
};

/**
 * Valida i parametri opzionali di lista (`page`/`limit`/`kind`) di
 * GET /api/v1/receipts. Valori *malformati* → `400` (regola 9: validazione al
 * boundary) invece del clamp/ignore silenzioso precedente (`page=-100`→1,
 * `kind=FOO`→tutti). Un `limit` oltre il massimo viene ridotto a
 * `LIST_MAX_LIMIT` (soft cap convenzionale, non un errore). Parametri assenti →
 * default documentati (`page=1`, `limit=20`, `kind=null` = entrambi i tipi).
 *
 * Ritorna `{ error: Response }` sul primo parametro invalido, così il caller fa:
 *   if ("error" in result) return result.error;
 */
export function parseListPagination(
  searchParams: URLSearchParams,
):
  | { error: Response }
  | { data: { page: number; limit: number; kind: "SALE" | "VOID" | null } } {
  const raw: Record<string, string> = {};
  for (const key of ["page", "limit", "kind"] as const) {
    const value = searchParams.get(key);
    if (value !== null) raw[key] = value;
  }

  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    const msg =
      (typeof field === "string" && LIST_QUERY_ERROR[field]) ||
      "Parametri di query non validi.";
    return { error: withCors(Response.json({ error: msg }, { status: 400 })) };
  }

  return {
    data: {
      page: parsed.data.page ?? 1,
      // Soft cap: un limit valido oltre il massimo viene ridotto, non rifiutato.
      limit: Math.min(LIST_MAX_LIMIT, parsed.data.limit ?? LIST_DEFAULT_LIMIT),
      kind: parsed.data.kind ?? null,
    },
  };
}
