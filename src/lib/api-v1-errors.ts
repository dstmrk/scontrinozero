/**
 * Envelope d'errore uniforme per le route `/api/v1/*` (REVIEW.md #18).
 *
 * Ogni risposta d'errore della Developer API ha esattamente questa forma:
 *
 *   { "code": "NOT_FOUND", "message": "Documento non trovato.", "requestId": "…" }
 *
 * - `code`   — stringa machine-readable, stabile: è il contratto su cui il
 *              client fa branching. Il catalogo qui sotto è la fonte di verità
 *              unica di code → status HTTP → retryability.
 * - `message`— testo in italiano per l'operatore umano. **Non** è contratto:
 *              può cambiare senza preavviso, non fare parsing del testo.
 * - `requestId` — UUID della richiesta, ripetuto nell'header `X-Request-Id` e
 *              in ogni riga di log pino/Sentry della stessa richiesta. È il
 *              filo per correlare una segnalazione utente ai nostri log.
 *
 * ⚠️ Breaking change v1: il campo legacy `error` è stato rimosso. Prima
 * l'envelope era `{ error }` (con `code` presente solo su alcuni 409/503).
 *
 * `X-Request-Id` viaggia su **tutte** le risposte, anche 200/201: serve a
 * correlare anche un successo di cui l'utente contesta l'esito a valle.
 */
import { randomUUID } from "node:crypto";

/** Header che porta il `requestId` su ogni risposta v1 (successi inclusi). */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Header letti dal client: senza `Access-Control-Expose-Headers` un chiamante
 * browser cross-origin vedrebbe la risposta ma **non** potrebbe leggere né il
 * requestId da mettere in un ticket né il backoff suggerito.
 */
const EXPOSED_HEADERS = `${REQUEST_ID_HEADER}, Retry-After`;

/**
 * CORS wildcard: la Developer API si autentica con Bearer token, non con
 * cookie, quindi nessuna credenziale ambient viene esposta da un `*`.
 */
// NOSONAR — developer API: auth via Bearer token (not cookies), wildcard is intentional
const CORS_ORIGIN = "*";

export function newRequestId(): string {
  return randomUUID();
}

type V1ErrorSpec = {
  status: number;
  /**
   * `true` ⇔ ritentare **la stessa richiesta con la stessa `idempotencyKey`**
   * ha senso. Su tutto il resto il retry automatico è inutile (input da
   * correggere) o pericoloso (stato già definitivo).
   */
  retryable: boolean;
  /** Backoff suggerito in secondi → header `Retry-After`. */
  retryAfter?: number;
};

/**
 * Catalogo dei codici d'errore v1: unica fonte di verità di status HTTP,
 * retryability e backoff. Aggiungere un codice qui è l'unico modo per poterlo
 * emettere — `V1ErrorCode` è derivato dalle chiavi.
 */
export const V1_ERROR_CATALOG = {
  // ── 400 — input da correggere ─────────────────────────────────────────────
  /** Corpo assente/non JSON. */
  INVALID_BODY: { status: 400, retryable: false },
  /** Corpo JSON valido ma che non rispetta lo schema (campo mancante/tipo). */
  VALIDATION_ERROR: { status: 400, retryable: false },
  /** Parametro di query malformato (`page`, `limit`, `kind`, `from`, `to`). */
  INVALID_QUERY_PARAM: { status: 400, retryable: false },
  /** UUID di path non valido. */
  INVALID_ID: { status: 400, retryable: false },

  // ── 401/402/403/404 — accesso ─────────────────────────────────────────────
  /** API key assente, malformata, non valida, revocata o scaduta. */
  UNAUTHORIZED: { status: 401, retryable: false },
  /** Il piano attivo non include l'accesso API. */
  PLAN_UPGRADE_REQUIRED: { status: 402, retryable: false },
  /** Serve una business key (`szk_live_`), è stata usata una management key. */
  BUSINESS_KEY_REQUIRED: { status: 403, retryable: false },
  /** Documento inesistente o di un altro esercente (404 generico, no oracle). */
  NOT_FOUND: { status: 404, retryable: false },

  // ── 409 — conflitto di stato / idempotenza ────────────────────────────────
  /** Emissione con la stessa key ancora in corso: ritenta fra poco. */
  PENDING_IN_PROGRESS: { status: 409, retryable: true, retryAfter: 2 },
  /** Annullo con la stessa key ancora in corso: ritenta fra poco. */
  VOID_PENDING_IN_PROGRESS: { status: 409, retryable: true, retryAfter: 2 },
  /** La key identifica un documento già rifiutato: serve una key nuova. */
  ALREADY_REJECTED: { status: 409, retryable: false },
  /** La key identifica uno scontrino già annullato: serve una key nuova. */
  ALREADY_VOIDED: { status: 409, retryable: false },
  /** Annullo concorrente già in corso sullo stesso SALE. */
  VOID_ALREADY_TARGETED: { status: 409, retryable: false },
  /** Key riusata con un payload diverso, o fra emissione e annullo. */
  IDEMPOTENCY_PAYLOAD_MISMATCH: { status: 409, retryable: false },
  /** Sessione AdE (CIE) scaduta: va rinnovata dall'app web (fattore umano). */
  ADE_REAUTH_REQUIRED: { status: 409, retryable: false },
  /** Password Fisconline scaduta: va aggiornata dall'app web (fattore umano). */
  ADE_PASSWORD_EXPIRED: { status: 409, retryable: false },

  // ── 413 ───────────────────────────────────────────────────────────────────
  /** Corpo oltre il limite di byte dell'endpoint. */
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false },

  // ── 422 — rifiuto funzionale permanente ───────────────────────────────────
  /**
   * L'AdE ha rifiutato il documento nel merito, o mancano dati fiscali. Il
   * documento **non** è stato registrato e ritentarlo identico fallirebbe di
   * nuovo: va corretto il contenuto (o le credenziali) prima.
   */
  ADE_REJECTED: { status: 422, retryable: false },

  // ── 429 ───────────────────────────────────────────────────────────────────
  /** Rate limit superato. `Retry-After` è calcolato sulla finestra scorrevole. */
  RATE_LIMIT_EXCEEDED: { status: 429, retryable: true },

  // ── 500 ───────────────────────────────────────────────────────────────────
  /** Annullo registrato su AdE ma sync DB fallita: serve intervento manuale. */
  VOID_SYNC_FAILED: { status: 500, retryable: false },
  /** Fallimento inatteso lato nostro. */
  INTERNAL_ERROR: { status: 500, retryable: false },

  // ── 503 — transient, ritentabile ──────────────────────────────────────────
  /** DB sovraccarico / statement timeout. */
  DB_TIMEOUT: { status: 503, retryable: true, retryAfter: 5 },
  /**
   * L'AdE non ha risposto (rete, 5xx, timeout SPID): l'esito della
   * trasmissione è **ignoto**. Ritenta con la **stessa** `idempotencyKey` —
   * una key nuova rischierebbe un doppione fiscale irreversibile.
   */
  ADE_UNAVAILABLE: { status: 503, retryable: true, retryAfter: 10 },
} as const satisfies Record<string, V1ErrorSpec>;

export type V1ErrorCode = keyof typeof V1_ERROR_CATALOG;

/** Envelope d'errore v1. Nessun altro campo viene mai serializzato. */
export type V1ErrorBody = {
  code: V1ErrorCode;
  message: string;
  requestId: string;
};

/**
 * `true` se ritentare la stessa richiesta (stessa `idempotencyKey`) ha senso.
 * Deriva dal catalogo: nessuna lista parallela da tenere in sync.
 */
export function isRetryableV1Error(code: V1ErrorCode): boolean {
  return v1ErrorSpec(code).retryable;
}

/**
 * Widening lookup: `as const satisfies` dà a ogni entry il tipo letterale
 * esatto, in cui `retryAfter` semplicemente non esiste quando è omesso.
 * Passare per `V1ErrorSpec` restituisce la forma con l'opzionale.
 */
function v1ErrorSpec(code: V1ErrorCode): V1ErrorSpec {
  return V1_ERROR_CATALOG[code];
}

function v1Headers(
  requestId: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    [REQUEST_ID_HEADER]: requestId,
    ...extra,
  };
}

/**
 * Costruisce una risposta d'errore v1.
 *
 * @param code      - codice del catalogo: determina status e `Retry-After`
 * @param message   - testo per l'umano (non è contratto, non fare parsing)
 * @param requestId - UUID della richiesta corrente
 * @param options.retryAfterSeconds - override del backoff (rate limit: dipende
 *   dalla finestra scorrevole, non è una costante del catalogo)
 */
export function v1Error(
  code: V1ErrorCode,
  message: string,
  requestId: string,
  options?: { retryAfterSeconds?: number },
): Response {
  const spec = v1ErrorSpec(code);
  const retryAfter = options?.retryAfterSeconds ?? spec.retryAfter;

  const body: V1ErrorBody = { code, message, requestId };

  return Response.json(body, {
    status: spec.status,
    headers: v1Headers(
      requestId,
      retryAfter === undefined
        ? undefined
        : { "Retry-After": String(retryAfter) },
    ),
  });
}

/**
 * Risposta di successo v1: stessi header CORS/`X-Request-Id` degli errori, così
 * il requestId è disponibile anche quando la richiesta è andata a buon fine.
 */
export function v1Json(
  body: unknown,
  requestId: string,
  init?: { status?: number },
): Response {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: v1Headers(requestId),
  });
}

/** Risposta 204 al preflight CORS. */
export function v1NoContent(methods: string, requestId: string): Response {
  return new Response(null, {
    status: 204,
    headers: v1Headers(requestId, {
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    }),
  });
}
