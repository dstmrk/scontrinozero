import { AdminAlert } from "@/components/admin/admin-alert";
import {
  AdminPaidUsersTable,
  AdminRecentProfilesTable,
  AdminTopMerchantsTables,
  AdminTrialExpiringTable,
} from "@/components/admin/admin-directory-tables";
import {
  AdminDocumentKpiCards,
  AdminUserKpiCards,
} from "@/components/admin/admin-kpi-cards";
import {
  getAdminPaidUsers,
  getAdminRecentProfiles,
  getAdminTopMerchants,
  getAdminTrialExpiring,
} from "@/server/admin-directory";
import { getAdminDocumentKpis, getAdminUserKpis } from "@/server/admin-metrics";
import type { AnalyticsRange } from "@/server/analytics-helpers";

/**
 * Le sei sezioni del pannello operatore: una lettura, un boundary Suspense,
 * un pezzo di pagina.
 *
 * Ognuna è un server component asincrono che `await`a la **sua** query e rende
 * il contenuto o l'avviso di quella query soltanto. È qui che la pagina smette
 * di essere un blocco unico: `src/app/admin/page.tsx` le monta dentro
 * altrettanti `<Suspense>` e Next le manda in streaming man mano che
 * rispondono, invece di trattenere l'HTML finché non c'è tutto.
 *
 * Stanno in un file a parte, e non inline nella pagina, per un motivo pratico:
 * un componente asincrono innestato in un boundary Suspense non è renderizzabile
 * da Testing Library, mentre queste funzioni si invocano direttamente
 * (`await AdminUserKpisSection({ range })`) e si testano come qualunque altra.
 *
 * **L'ordine in cui la pagina le monta è l'ordine in cui le query girano.** Il
 * pannello tiene una sola connessione per volta (`runAdminRead` in
 * `src/server/admin-sql.ts`), la coda è FIFO e React invoca i figli nell'ordine
 * dell'albero: spostare una sezione più in alto nella pagina la fa comparire
 * prima. Le due sezioni KPI stanno per questo davanti alle tabelle.
 */

interface RangeSectionProps {
  readonly range: AnalyticsRange;
}

/** Le tre card utenti. `col-span-full` sull'avviso: prende il posto di tutte e tre. */
export async function AdminUserKpisSection({ range }: RangeSectionProps) {
  const result = await getAdminUserKpis(range);

  if ("error" in result) {
    return <AdminAlert message={result.error} className="col-span-full" />;
  }
  return <AdminUserKpiCards kpis={result.kpis} />;
}

/** Le tre card scontrini — la lettura più lenta del pannello. */
export async function AdminDocumentKpisSection({ range }: RangeSectionProps) {
  const result = await getAdminDocumentKpis(range);

  if ("error" in result) {
    return <AdminAlert message={result.error} className="col-span-full" />;
  }
  return <AdminDocumentKpiCards kpis={result.kpis} />;
}

/** Le due classifiche esercenti, dalla stessa query. */
export async function AdminTopMerchantsSection({ range }: RangeSectionProps) {
  const result = await getAdminTopMerchants(range);

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminTopMerchantsTables merchants={result.merchants} />;
}

/** Trial in scadenza: finestra ancorata ad adesso, nessun range da passare. */
export async function AdminTrialExpiringSection() {
  const result = await getAdminTrialExpiring();

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminTrialExpiringTable rows={result.rows} />;
}

/** Utenti paganti: fotografia dello stato attuale, nessun range da passare. */
export async function AdminPaidUsersSection() {
  const result = await getAdminPaidUsers();

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminPaidUsersTable rows={result.rows} />;
}

/** Registrati di recente nel periodo. */
export async function AdminRecentProfilesSection({ range }: RangeSectionProps) {
  const result = await getAdminRecentProfiles(range);

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminRecentProfilesTable rows={result.rows} />;
}
