/**
 * Risolve la sessione AdE dell'esercente dentro una sua richiesta HTTP.
 *
 * Estratto da `pending-verification.ts` (REVIEW.md #103, slice 2) quando la
 * ricerca dei documenti su AdE (v1.8.0) è diventata il secondo chiamante dello
 * stesso identico gesto: leggere i prerequisiti, scartare subito una CIE senza
 * sessione interattiva viva, tradurre in `WithAdeSessionParams`.
 *
 * **Perché NON copre anche emit/void.** `receipt-service` e `void-service`
 * fanno gli stessi due passi ma hanno bisogno anche di `cedentePrestatore` per
 * comporre il payload, e rispondono con il loro tipo di risultato
 * (`{ reauthRequired: true }`). Tirarli dentro qui vorrebbe dire un helper che
 * ritorna l'unione di tre contratti diversi: più superficie per meno chiarezza.
 * Qui stanno i due chiamanti che condividono un contratto *identico* — quelli
 * che leggono da AdE senza trasmettere niente.
 *
 * **Perché l'esito non porta il messaggio.** `cie-reauth` è una condizione, non
 * una frase: la verifica di uno scontrino in sospeso e la ricerca nello storico
 * la raccontano all'esercente in due modi diversi, e un messaggio unico qui
 * dentro sarebbe sbagliato per almeno uno dei due. Il testo lo scrive il
 * chiamante; questo modulo dice solo cosa è successo.
 */
import { isCieSessionMissing, type WithAdeSessionParams } from "@/lib/ade";
import { fetchAdePrerequisites, toAdeSessionParams } from "@/lib/server-auth";

export type AdeUserSession =
  /** Sessione risolta: `params` è pronto per `withAdeSession`. */
  | { ok: true; params: WithAdeSessionParams }
  /**
   * Nessuna sessione possibile: credenziali assenti, non verificate o
   * incomplete. `error` è già il messaggio scritto da `fetchAdePrerequisites`,
   * che è l'unico a sapere quale dei tre casi è.
   */
  | { ok: false; reason: "unavailable"; error: string }
  /** CIE senza sessione interattiva viva: serve un nuovo accesso umano. */
  | { ok: false; reason: "cie-reauth" };

/**
 * **Nessun effetto collaterale**, deliberatamente: i chiamanti la mettono prima
 * di qualunque scrittura, così un fallimento non lascia dietro di sé una riga
 * toccata a vuoto.
 */
export async function resolveAdeUserSession(
  businessId: string,
): Promise<AdeUserSession> {
  const prerequisites = await fetchAdePrerequisites(businessId);
  if ("error" in prerequisites) {
    return { ok: false, reason: "unavailable", error: prerequisites.error };
  }
  if (prerequisites.method === "cie" && isCieSessionMissing(businessId)) {
    return { ok: false, reason: "cie-reauth" };
  }
  return { ok: true, params: toAdeSessionParams(businessId, prerequisites) };
}
