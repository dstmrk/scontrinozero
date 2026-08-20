/**
 * Shared helpers for /api/v1/* route handlers.
 *
 * Centralises the four patterns that appear in every v1 route:
 *   1. Auth + plan gate + business key check
 *   2. CORS preflight (OPTIONS)
 *   3. Rate limit check
 *   4. Request body parsing + Zod validation
 *
 * Ogni risposta d'errore prodotta qui passa da `v1Error`
 * (`src/lib/api-v1-errors.ts`): envelope `{ code, message, requestId }`,
 * status e `Retry-After` derivati dal catalogo. Il `requestId` è generato una
 * volta per richiesta dalla route e passato lungo tutta la catena.
 */
import { authenticateApiKey, isApiKeyAuthError } from "@/lib/api-auth";
import type { ApiKeyContext } from "@/lib/api-auth";
import { v1Error } from "@/lib/api-v1-errors";
import { canUseApi } from "@/lib/plans";
import { logger } from "@/lib/logger";
import { readJsonWithLimit } from "@/lib/request-utils";
import type { RateLimiter } from "@/lib/rate-limit";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { z, type ZodType } from "zod/v4";
import type { V1ErrorCode } from "@/lib/api-v1-errors";

/**
 * Messaggio del 409 quando la sessione AdE interattiva (CIE) è scaduta: va
 * rinnovata dall'app web (secondo fattore umano), il retry automatico via API
 * è inutile finché l'utente non si ricollega. Condiviso da POST /v1/receipts e
 * POST /v1/receipts/{id}/void per evitare la duplicazione del body inline.
 */
export const ADE_REAUTH_REQUIRED_MESSAGE =
  "Sessione AdE (CIE) scaduta: ricollegati dall'app web ScontrinoZero prima di riprovare.";

/** Messaggio del 503 quando l'AdE non risponde: retry con la STESSA key. */
export const ADE_UNAVAILABLE_MESSAGE =
  "Agenzia delle Entrate non raggiungibile: riprova con la stessa idempotencyKey.";

/** ApiKeyContext with businessId narrowed to string (management keys excluded). */
export type BusinessApiContext = Omit<ApiKeyContext, "businessId"> & {
  businessId: string;
};

/**
 * Runs auth, plan gate, and business key checks common to all v1 API routes.
 *
 * Returns `{ error: Response }` on any failure so the caller can do:
 *   if ("error" in result) return result.error;
 */
export async function requireBusinessApiAuth(
  request: Request,
  requestId: string,
): Promise<{ error: Response } | { context: BusinessApiContext }> {
  const auth = await authenticateApiKey(request);
  if (isApiKeyAuthError(auth)) {
    // 503: DB sovraccarico durante l'auth lookup — transient e ritentabile,
    // da tenere distinto dal 401 (chiave permanentemente invalida).
    const code: V1ErrorCode =
      auth.status === 503 ? "DB_TIMEOUT" : "UNAUTHORIZED";
    return { error: v1Error(code, auth.error, requestId) };
  }

  if (!canUseApi(auth.plan, auth.planExpiresAt, auth.trialStartedAt)) {
    return {
      error: v1Error(
        "PLAN_UPGRADE_REQUIRED",
        "Il tuo piano non include l'accesso alle API. Passa al piano Pro o Developer.",
        requestId,
      ),
    };
  }

  if (!auth.businessId) {
    return {
      error: v1Error(
        "BUSINESS_KEY_REQUIRED",
        "Questa API richiede una business key (szk_live_).",
        requestId,
      ),
    };
  }

  return { context: auth as BusinessApiContext };
}

/**
 * Checks rate limit and returns a 429 Response if exceeded, null otherwise.
 * The response includes a `Retry-After` header (seconds) for machine-readable backoff.
 *
 * @param limiter   - RateLimiter instance (module-level singleton in the route)
 * @param key       - Rate limit bucket key, e.g. "api:emit:<apiKeyId>"
 * @param apiKeyId  - Used in the warning log only
 * @param logMsg    - Log message distinguishing the operation (emit vs void, etc.)
 * @param requestId - UUID della richiesta corrente (envelope + log)
 */
export function checkRateLimitApi(
  limiter: RateLimiter,
  key: string,
  apiKeyId: string,
  logMsg: string,
  requestId: string,
): Response | null {
  const result = limiter.check(key);
  if (!result.success) {
    logger.warn({ apiKeyId, requestId }, logMsg);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt - Date.now()) / 1000),
    );
    return v1Error(
      "RATE_LIMIT_EXCEEDED",
      ERROR_MESSAGES.RATE_LIMIT_API_HOURS,
      requestId,
      { retryAfterSeconds },
    );
  }
  return null;
}

/**
 * Mappa i codici d'errore dei service (`emitReceiptForBusiness`,
 * `voidReceiptForBusiness`) sui codici dell'envelope pubblico v1.
 *
 * I due insiemi coincidono oggi, ma restano disaccoppiati di proposito: il
 * codice del service è un dettaglio interno, quello dell'envelope è contratto
 * pubblico. Un codice non mappato (o assente) è un fallimento AdE funzionale
 * non classificato → `ADE_REJECTED` (422), il fallback storico.
 */
const SERVICE_CODE_TO_V1: Record<string, V1ErrorCode> = {
  DB_TIMEOUT: "DB_TIMEOUT",
  PENDING_IN_PROGRESS: "PENDING_IN_PROGRESS",
  ALREADY_REJECTED: "ALREADY_REJECTED",
  ALREADY_VOIDED: "ALREADY_VOIDED",
  VOID_PENDING_IN_PROGRESS: "VOID_PENDING_IN_PROGRESS",
  VOID_ALREADY_TARGETED: "VOID_ALREADY_TARGETED",
  VOID_SYNC_FAILED: "VOID_SYNC_FAILED",
  IDEMPOTENCY_PAYLOAD_MISMATCH: "IDEMPOTENCY_PAYLOAD_MISMATCH",
  ADE_REAUTH_REQUIRED: "ADE_REAUTH_REQUIRED",
  ADE_PASSWORD_EXPIRED: "ADE_PASSWORD_EXPIRED",
  ADE_UNAVAILABLE: "ADE_UNAVAILABLE",
  NOT_FOUND: "NOT_FOUND",
};

export function serviceErrorResponse(
  result: { error: string; code?: string },
  requestId: string,
): Response {
  // Object.hasOwn: `code` viene da un risultato di service, ma la lookup su un
  // record letterale con una chiave arbitraria è comunque il pattern che la
  // skill security-patterns chiede di blindare (prototype pollution).
  const code =
    result.code && Object.hasOwn(SERVICE_CODE_TO_V1, result.code)
      ? SERVICE_CODE_TO_V1[result.code]
      : "ADE_REJECTED";

  return v1Error(code, result.error, requestId);
}

/**
 * Reads and validates the request body against a Zod schema.
 *
 * Returns `{ error: Response }` on size/parse/validation failure,
 * or `{ data: T }` on success.
 *
 * @param request   - Incoming request
 * @param schema    - Zod schema to validate against
 * @param maxBytes  - Maximum allowed body size in bytes
 * @param requestId - UUID della richiesta corrente
 */
export async function parseAndValidateBody<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes: number,
  requestId: string,
): Promise<{ error: Response } | { data: T }> {
  const bodyResult = await readJsonWithLimit(request, maxBytes);
  if (!bodyResult.ok) {
    return {
      error:
        "tooLarge" in bodyResult
          ? v1Error("PAYLOAD_TOO_LARGE", "Payload troppo grande.", requestId)
          : v1Error("INVALID_BODY", "Body non valido.", requestId),
    };
  }

  const parsed = schema.safeParse(bodyResult.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.join(".");
    const msg = field
      ? `Il campo '${field}' non è valido: ${issue.message}`
      : (issue?.message ?? "Input non valido.");
    return { error: v1Error("VALIDATION_ERROR", msg, requestId) };
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
  requestId: string,
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
    return { error: v1Error("INVALID_QUERY_PARAM", msg, requestId) };
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
