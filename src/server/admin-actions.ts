"use server";

import {
  type AdminPaidUsersResult,
  type AdminTopMerchantsResult,
  getAdminPaidUsers,
  getAdminTopMerchants,
} from "./admin-directory";
import { requireAdmin } from "./admin-guard";
import {
  type AdminDocumentKpisResult,
  type AdminUserKpisResult,
  getAdminDocumentKpis,
  getAdminUserKpis,
} from "./admin-metrics";
import { type AnalyticsRange, parseAnalyticsRange } from "./analytics-helpers";

/**
 * Le letture del pannello amministratore che si caricano solo su richiesta:
 * le quattro card di "Altre metriche" in `src/app/admin/page.tsx`, ognuna
 * col suo pulsante "Carica".
 *
 * **Perché server action e non un link `?load=…`.** Una navigazione RSC
 * ridisegna tutta la pagina, quindi ogni click rifarebbe anche le letture
 * sempre visibili: il contrario di quello che il caricamento su richiesta
 * vuole. Un'action fa partire una query sola.
 *
 * **Il gate.** Sono gli unici endpoint RPC del pannello, raggiungibili da
 * chiunque abbia l'id dell'action. Ognuna verifica l'amministratore prima di
 * tutto, e `runAdminRead` lo rifà sul dato (`src/server/admin-sql.ts`):
 * un non-admin riceve un `{ error }` senza aver toccato Postgres né occupato
 * il posto in coda. Nessun rate limit: le letture admin passano già una per
 * volta, quindi un admin che clicca a raffica si fa la coda da solo e non
 * toglie al pool più di una connessione.
 *
 * Degradano a `{ error }` e non lanciano (regola 19): le letture sotto lo
 * fanno già, e il rifiuto del gate fa lo stesso.
 */

const ACCESS_DENIED = { error: "Accesso non consentito." } as const;
const INVALID_RANGE = { error: "Periodo non valido." } as const;

/** `requireAdmin` come booleano: un rifiuto qui è un `{ error }`, non un throw. */
async function isAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

/**
 * Il periodo arriva dal client e va trattato come input: l'allowlist è
 * quella di `parseAnalyticsRange`. Un valore fuori lista è un errore e non
 * un default, perché qui nessun URL da correggere ha prodotto il valore.
 */
function toRange(raw: unknown): AnalyticsRange | null {
  if (typeof raw !== "string") return null;
  return parseAnalyticsRange(raw) === raw ? (raw as AnalyticsRange) : null;
}

export async function loadAdminUserKpis(
  range: unknown,
): Promise<AdminUserKpisResult> {
  if (!(await isAdmin())) return ACCESS_DENIED;
  const parsed = toRange(range);
  if (!parsed) return INVALID_RANGE;
  return getAdminUserKpis(parsed);
}

export async function loadAdminDocumentKpis(
  range: unknown,
): Promise<AdminDocumentKpisResult> {
  if (!(await isAdmin())) return ACCESS_DENIED;
  const parsed = toRange(range);
  if (!parsed) return INVALID_RANGE;
  return getAdminDocumentKpis(parsed);
}

export async function loadAdminTopMerchants(
  range: unknown,
): Promise<AdminTopMerchantsResult> {
  if (!(await isAdmin())) return ACCESS_DENIED;
  const parsed = toRange(range);
  if (!parsed) return INVALID_RANGE;
  return getAdminTopMerchants(parsed);
}

export async function loadAdminPaidUsers(): Promise<AdminPaidUsersResult> {
  if (!(await isAdmin())) return ACCESS_DENIED;
  return getAdminPaidUsers();
}
