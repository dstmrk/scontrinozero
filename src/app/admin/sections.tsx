import { cache } from "react";

import { AdminAlert } from "@/components/admin/admin-alert";
import {
  AdminPaidUsersTable,
  AdminRecentProfilesTable,
  AdminStalePendingDocumentsTable,
  AdminStalledOnboardingTable,
  AdminTopMerchantsTables,
  AdminTrialActiveMerchantsTable,
  AdminTrialExpiringTable,
} from "@/components/admin/admin-directory-tables";
import { AdminFunnelCard } from "@/components/admin/admin-funnel-card";
import {
  AdminDocumentKpiCards,
  AdminTrialActiveKpiCard,
  AdminUserKpiCards,
} from "@/components/admin/admin-kpi-cards";
import {
  getAdminPaidUsers,
  getAdminRecentProfiles,
  getAdminStalePendingDocuments,
  getAdminStalledOnboarding,
  getAdminTopMerchants,
  getAdminTrialActive,
  getAdminTrialExpiring,
} from "@/server/admin-directory";
import {
  getAdminDocumentKpis,
  getAdminFunnel,
  getAdminUserKpis,
} from "@/server/admin-metrics";
import type { AnalyticsRange } from "@/server/analytics-helpers";

/**
 * Le sezioni del pannello amministratore: un boundary Suspense, un pezzo di
 * pagina, e di regola una lettura ciascuna. L'eccezione sono le due sezioni
 * dei trial attivi (KPI e tabella), che condividono una lettura via
 * `loadTrialActive`.
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
 * prima. Le sezioni KPI stanno per questo davanti alle tabelle.
 */

interface RangeSectionProps {
  readonly range: AnalyticsRange;
}

/** Le due card utenti. `col-span-full` sull'avviso: prende il posto di entrambe. */
export async function AdminUserKpisSection({ range }: RangeSectionProps) {
  const result = await getAdminUserKpis(range);

  if ("error" in result) {
    return <AdminAlert message={result.error} className="col-span-full" />;
  }
  return <AdminUserKpiCards kpis={result.kpis} />;
}

/**
 * Il funnel di sempre. Occupa due colonne della griglia KPI: anche l'avviso
 * d'errore, così la riga non cambia forma quando la query cade.
 */
export async function AdminFunnelSection() {
  const result = await getAdminFunnel();

  if ("error" in result) {
    return <AdminAlert message={result.error} className="lg:col-span-2" />;
  }
  return <AdminFunnelCard funnel={result.funnel} />;
}

/**
 * Una lettura per due sezioni: il KPI "Trial attivi" in cima e la tabella
 * "Trial attivi con scontrini" più in basso devono mostrare la stessa
 * fotografia. `cache` di React deduplica dentro la singola richiesta RSC: la
 * prima sezione che la chiama occupa il posto in coda, la seconda riceve la
 * stessa promessa. Fuori da un render server è un passthrough.
 */
const loadTrialActive = cache(getAdminTrialActive);

/** Trial attivi adesso, e quanti hanno già emesso scontrini. */
export async function AdminTrialActiveKpiSection() {
  const result = await loadTrialActive();

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminTrialActiveKpiCard trials={result.trials} />;
}

/** Le due card scontrini e incasso — la lettura più lenta del pannello. */
export async function AdminDocumentKpisSection({ range }: RangeSectionProps) {
  const result = await getAdminDocumentKpis(range);

  if ("error" in result) {
    return <AdminAlert message={result.error} className="col-span-full" />;
  }
  return <AdminDocumentKpiCards kpis={result.kpis} />;
}

/**
 * Documenti `SALE` fermi oltre la soglia stale (PR #904). Ancorata ad
 * adesso, nessun range da passare — un orfano di tre settimane fa è
 * esattamente quello che interessa vedere.
 */
export async function AdminStalePendingDocumentsSection() {
  const result = await getAdminStalePendingDocuments();

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminStalePendingDocumentsTable rows={result.rows} />;
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

/**
 * Utenti in trial attivo che hanno emesso scontrini, storico completo.
 * Ancorata ad adesso come "Trial in scadenza", di fianco a cui sta in pagina.
 */
export async function AdminTrialActiveMerchantsSection() {
  const result = await loadTrialActive();

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminTrialActiveMerchantsTable merchants={result.trials.merchants} />;
}

/**
 * Onboarding fermi: chi ha salvato le credenziali AdE, non le ha mai
 * verificate e ha ancora un trial attivo (PR #957). Ancorata ad
 * adesso, nessun range da passare.
 */
export async function AdminStalledOnboardingSection() {
  const result = await getAdminStalledOnboarding();

  if ("error" in result) {
    return <AdminAlert message={result.error} />;
  }
  return <AdminStalledOnboardingTable stalled={result.stalled} />;
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
