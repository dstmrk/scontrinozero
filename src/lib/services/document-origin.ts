/**
 * Da dove arriva un documento commerciale (issue #1099): da un membro
 * dell'attività nella web app, o da una chiave della Developer API.
 *
 * Obbligatoria all'ingresso di emissione, annullo e reso, così un documento
 * senza autore non si crea per dimenticanza. Non c'è un CHECK nel DB perché
 * `api_key_id` torna NULL quando la chiave viene cancellata (ON DELETE SET
 * NULL), e un vincolo "uno dei due" bloccherebbe quella cancellazione.
 */
export type DocumentOrigin = { memberId: string } | { apiKeyId: string };

/** Le due colonne di `commercial_documents` che registrano l'origine. */
export type DocumentOriginColumns = {
  createdBy: string | null;
  apiKeyId: string | null;
};

export function documentOriginColumns(
  origin: DocumentOrigin,
): DocumentOriginColumns {
  return "memberId" in origin
    ? { createdBy: origin.memberId, apiKeyId: null }
    : { createdBy: null, apiKeyId: origin.apiKeyId };
}
