import { Suspense } from "react";
import type { Metadata } from "next";

import { AdminRangeTabs } from "@/components/admin/admin-range-tabs";
import {
  AdminPaidUsersSkeleton,
  AdminRecentProfilesSkeleton,
  AdminStalePendingDocumentsSkeleton,
  AdminStalledOnboardingSkeleton,
  AdminTopMerchantsSkeleton,
  AdminTrialActiveMerchantsSkeleton,
  AdminTrialExpiringSkeleton,
} from "@/components/admin/admin-directory-tables";
import { AdminKpiCardsSkeleton } from "@/components/admin/admin-skeletons";
import {
  type AnalyticsRange,
  parseAnalyticsRange,
} from "@/server/analytics-helpers";
import {
  AdminDocumentKpisSection,
  AdminPaidUsersSection,
  AdminRecentProfilesSection,
  AdminStalePendingDocumentsSection,
  AdminStalledOnboardingSection,
  AdminTopMerchantsSection,
  AdminTrialActiveMerchantsSection,
  AdminTrialExpiringSection,
  AdminTrialFunnelSection,
  AdminUserKpisSection,
} from "./sections";

/**
 * Pannello amministratore — KPI ed elenchi aggregati su tutti i tenant.
 *
 * Server component, nessuna server action esposta. L'unico JavaScript
 * spedito oltre a quello del root layout è il selettore di periodo
 * (`AdminRangeTabs`), un Client Component minimo — vedi il suo file per il
 * perché. Il periodo è un deep link (`?range=`) validato contro l'allowlist
 * di `parseAnalyticsRange`, che su valore ignoto ricade sul default invece di
 * lanciare (regola 19).
 *
 * **La pagina non aspetta nessuna query.** Il guscio — selettore di periodo —
 * esce subito; le dieci letture stanno dietro ad altrettanti `<Suspense>` e
 * Next manda in streaming ogni blocco appena la sua query risponde. Un solo
 * `await Promise.all(...)` in cima non partirebbe finché non c'è l'ultimo
 * dato, e la scansione dello storico scontrini si porterebbe dietro anche i
 * blocchi che sono pronti da un pezzo.
 *
 * **`key={range}` sui boundary che leggono `range`.** Senza, un cambio di
 * periodo è un update dentro lo stesso transition di navigazione: React
 * tiene il contenuto vecchio finché la query nuova non risponde, quindi lo
 * skeleton non si vede mai. La `key` forza React a smontare e rimontare quel
 * `<Suspense>` sul nuovo periodo, che quindi mostra di nuovo il fallback. I
 * boundary ancorati ad "adesso" (documenti in sospeso, onboarding fermi,
 * trial in scadenza, trial attivi, utenti paganti) non hanno la key: non
 * dipendono da `range`, quindi non devono ripartire quando cambia.
 *
 * **Il tetto sul pool viene prima della velocità del pannello.** Le dieci
 * letture NON girano in parallelo: `runAdminRead` (`src/server/admin-sql.ts`)
 * ne lascia passare una per volta, così `/admin` non può mai togliere più di
 * una connessione delle dieci che servono la cassa. Il tempo totale resta
 * quindi la somma delle dieci query; quello che cambia è che si vede arrivare
 * il pannello un pezzo alla volta invece di fissare una pagina bianca.
 *
 * Corollario: l'ordine dei `<Suspense>` qui sotto è l'ordine della coda. In
 * testa ci sono i KPI, che sono ciò che si guarda per primo; il rilevatore dei
 * documenti in sospeso — un `count(*)` senza join, quindi economico — sta
 * subito dopo, appaiato all'onboarding fermi.
 */
export const metadata: Metadata = {
  title: "Pannello amministratore",
  robots: { index: false, follow: false },
};

/**
 * Periodo aperto per default dal pannello, **più stretto** del default
 * dell'analytics esercente (`DEFAULT_ANALYTICS_RANGE`, 30 giorni), che resta
 * intoccato: è un piano a pagamento e non si sposta di sotto ai clienti.
 *
 * Sette giorni perché alcune delle dieci letture — classifiche esercenti,
 * registrati di recente, funnel trial — filtrano davvero su `created_at >=
 * rangeStart`, e lì un quarto del periodo è un quarto delle righe da
 * aggregare. Le altre non ne beneficiano: la query scontrini legge
 * `created_at < rangeEnd`, cioè tutto lo storico a prescindere, e le tabelle
 * ancorate ad adesso (trial in scadenza, onboarding fermi, documenti in
 * sospeso, trial attivi con scontrini, utenti paganti) non lo guardano per
 * scelta — un orfano di tre settimane fa, o un onboarding arenato a maggio,
 * sono proprio quello che interessa vedere.
 */
const DEFAULT_ADMIN_RANGE: AnalyticsRange = "7d";

export default async function AdminPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ range?: string }>;
}) {
  const range = parseAnalyticsRange(
    (await searchParams).range,
    DEFAULT_ADMIN_RANGE,
  );

  return (
    <div className="space-y-6">
      <AdminRangeTabs active={range} />

      {/* La griglia è qui e non nei componenti: `<Suspense>` non produce un
          nodo DOM, quindi card e scheletri restano figli diretti della griglia
          e si sostituiscono uno a uno senza spostare il layout. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {/* `sparklines` rispecchia il gruppo vero — 1 card su 2 fra gli
            utenti, 2 su 3 fra gli scontrini — così le card non cambiano
            altezza quando il contenuto prende il posto dello scheletro. */}
        <Suspense
          key={`user-kpis-${range}`}
          fallback={
            <AdminKpiCardsSkeleton
              count={2}
              sparklines={1}
              label="metriche utenti"
            />
          }
        >
          <AdminUserKpisSection range={range} />
        </Suspense>
        <Suspense
          key={`trial-funnel-${range}`}
          fallback={<AdminKpiCardsSkeleton count={1} label="funnel trial" />}
        >
          <AdminTrialFunnelSection range={range} />
        </Suspense>
        <Suspense
          key={`document-kpis-${range}`}
          fallback={
            <AdminKpiCardsSkeleton
              count={3}
              sparklines={2}
              label="metriche scontrini"
            />
          }
        >
          <AdminDocumentKpisSection range={range} />
        </Suspense>
      </div>

      <div className="space-y-4">
        {/* Documenti in sospeso e onboarding fermi affiancati: metà larghezza
            ciascuna su tablet e desktop, incolonnate su mobile. Sono le due
            tabelle che chiedono un'azione, non solo che si guardano. */}
        <div className="grid gap-4 md:grid-cols-2">
          <Suspense fallback={<AdminStalePendingDocumentsSkeleton />}>
            <AdminStalePendingDocumentsSection />
          </Suspense>
          <Suspense fallback={<AdminStalledOnboardingSkeleton />}>
            <AdminStalledOnboardingSection />
          </Suspense>
        </div>

        <Suspense
          key={`top-merchants-${range}`}
          fallback={<AdminTopMerchantsSkeleton />}
        >
          <AdminTopMerchantsSection range={range} />
        </Suspense>

        <div className="grid gap-4 md:grid-cols-2">
          <Suspense fallback={<AdminTrialExpiringSkeleton />}>
            <AdminTrialExpiringSection />
          </Suspense>
          <Suspense fallback={<AdminTrialActiveMerchantsSkeleton />}>
            <AdminTrialActiveMerchantsSection />
          </Suspense>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Suspense fallback={<AdminPaidUsersSkeleton />}>
            <AdminPaidUsersSection />
          </Suspense>
          <Suspense
            key={`recent-profiles-${range}`}
            fallback={<AdminRecentProfilesSkeleton />}
          >
            <AdminRecentProfilesSection range={range} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
