/**
 * Discriminante per gli errori di statement timeout di Postgres.
 *
 * Postgres ritorna SQLSTATE `57014` (`query_canceled`) quando una query
 * eccede `statement_timeout` o riceve un cancel esplicito. È l'unico signal
 * affidabile di "è stato il timeout" — il messaggio testuale può variare
 * tra versioni di Postgres e localizzazioni.
 *
 * Accetta sia istanze Error (PostgresError di postgres-js eredita da Error)
 * sia oggetti plain con la stessa shape, per robustezza ai mock di test.
 */
export function isStatementTimeoutError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "57014";
}

const RETRY_AFTER_SECONDS = 5;

/**
 * Risposta canonica per un timeout DB lato server.
 *
 * 503 (non 500): comunica al client che il fallimento è transient e ritentabile.
 * `Retry-After` indica il backoff suggerito; il body include un `code`
 * machine-readable distinto dagli errori logici, così il client può
 * discriminare retry automatici da errori permanenti senza parsing del testo.
 */
export function dbTimeoutResponse(): Response {
  return Response.json(
    {
      code: "DB_TIMEOUT",
      error:
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
    },
    {
      status: 503,
      headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
    },
  );
}
