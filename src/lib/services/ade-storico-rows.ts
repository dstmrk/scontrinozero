/**
 * I documenti commerciali che stanno sull'archivio AdE e **non** nel nostro
 * database: emessi dal portale, dall'app AdE o da un altro software che usa lo
 * stesso servizio (feature Pro, v1.8.0).
 *
 * Un modulo solo perché i lettori sono due — l'elenco storico e l'export CSV
 * di riepilogo — e devono vedere esattamente le stesse righe. Se l'elenco
 * deduplicasse in un modo e il file in un altro, il conteggio a schermo e le
 * righe scaricate non tornerebbero, ed è la prima cosa che si nota.
 *
 * Non lancia mai: ogni fallimento diventa un `adeError` che il chiamante
 * affianca alle righe nostre (regola 19). Un elenco svuotato perché una
 * sorgente accessoria non risponde sarebbe la risposta sbagliata — l'esercente
 * stava cercando i suoi scontrini, e quelli ci sono.
 */
import { getDb } from "@/db";
import { withAdeSession } from "@/lib/ade";
import { logAdeFailure } from "@/lib/ade/log-failure";
import type { AdeReceiptListItem } from "@/types/storico";
import { fetchAdeSaleRows, type AdeSearchRange } from "./ade-document-search";
import { findClaimedTransactionIds } from "./ade-recovery";
import { resolveAdeUserSession } from "./ade-user-session";

export const ADE_UNREACHABLE =
  "Agenzia delle Entrate non raggiungibile: l'elenco mostra solo i documenti emessi da ScontrinoZero.";

export const ADE_CIE_REAUTH =
  "Sessione CIE scaduta: ricollegati all'Agenzia delle Entrate per cercare anche i documenti emessi altrove.";

export type ForeignAdeRows =
  | { rows: AdeReceiptListItem[]; truncated: boolean }
  | { adeError: string; adeReauthRequired?: boolean };

export type ForeignAdeRowsParams = {
  businessId: string;
  /**
   * Finestre già validate e tradotte nel formato dei query param AdE: una per
   * mese solare, dalla più recente alla più vecchia.
   */
  ranges: readonly AdeSearchRange[];
  status?: "ACCEPTED" | "VOID_ACCEPTED";
  /**
   * Gli **stessi** estremi che il DB riceve come predicato. I query param AdE
   * hanno granularità di giorno, quindi il portale può restituire righe appena
   * fuori dalle mezzanotti italiane che delimitano la giornata: senza questo
   * taglio le due sorgenti mostrerebbero due periodi diversi.
   */
  from: Date | null;
  toExclusive: Date | null;
};

/** Tiene solo i documenti AdE che il filtro corrente mostrerebbe. */
function inCurrentFilter(
  row: AdeReceiptListItem,
  params: ForeignAdeRowsParams,
): boolean {
  if (params.status && row.status !== params.status) return false;
  const at = row.adeRegisteredAt.getTime();
  if (params.from && at < params.from.getTime()) return false;
  if (params.toExclusive && at >= params.toExclusive.getTime()) return false;
  return true;
}

export async function fetchForeignAdeRows(
  params: ForeignAdeRowsParams,
): Promise<ForeignAdeRows> {
  const session = await resolveAdeUserSession(params.businessId);
  if (!session.ok) {
    if (session.reason === "cie-reauth") {
      return { adeError: ADE_CIE_REAUTH, adeReauthRequired: true };
    }
    return { adeError: session.error };
  }

  let fetched: Awaited<ReturnType<typeof fetchAdeSaleRows>>;
  try {
    fetched = await withAdeSession(session.params, (client) =>
      fetchAdeSaleRows(client, params.ranges),
    );
  } catch (err) {
    // Credenziali sbagliate, portale giù, timeout: condizioni previste dal
    // mondo, non bug nostri (regola 20). `logAdeFailure` decide da sé cosa
    // sale a Sentry e cosa resta un warn.
    logAdeFailure(
      err,
      { businessId: params.businessId, flow: "storico-search" },
      {
        transient: "Ricerca storico: searchDocuments fallita (transient)",
        failure: "Ricerca storico: searchDocuments fallita",
      },
    );
    return { adeError: ADE_UNREACHABLE };
  }

  const inRange = fetched.rows.filter((row) => inCurrentFilter(row, params));

  // I nostri documenti sono nell'archivio AdE come tutti gli altri: senza
  // questa sottrazione ogni scontrino emesso da ScontrinoZero comparirebbe due
  // volte. La chiave è `idtrx`, che salviamo su ogni riga finalizzata.
  const claimed = await findClaimedTransactionIds(getDb(), {
    businessId: params.businessId,
    idtrxs: inRange.map((row) => row.idtrx),
  });

  return {
    rows: inRange.filter((row) => !claimed.has(row.idtrx)),
    truncated: fetched.truncated,
  };
}
