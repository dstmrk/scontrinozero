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
import {
  AdminFunnelSkeleton,
  AdminKpiCardsSkeleton,
} from "@/components/admin/admin-skeletons";
import { requireAdminOrNotFound } from "@/server/admin-guard";
import {
  type AnalyticsRange,
  parseAnalyticsRange,
} from "@/server/analytics-helpers";
import {
  AdminDocumentKpisSection,
  AdminFunnelSection,
  AdminPaidUsersSection,
  AdminRecentProfilesSection,
  AdminStalePendingDocumentsSection,
  AdminStalledOnboardingSection,
  AdminTopMerchantsSection,
  AdminTrialActiveKpiSection,
  AdminTrialActiveMerchantsSection,
  AdminTrialExpiringSection,
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
 * **Due livelli.** In alto quello che si guarda ogni volta: funnel di
 * sempre, trial attivi, registrati e onboarding fermi, trial in scadenza,
 * documenti in sospeso. Sotto, in un `<details>` chiuso, le metriche del
 * periodo che si guardano di rado: nuovi utenti, scontrini e incasso, utenti
 * paganti, classifiche esercenti.
 *
 * **La pagina non aspetta nessuna query.** Il guscio — selettore di periodo —
 * esce subito; ogni lettura sta dietro al suo `<Suspense>` e Next manda in
 * streaming ogni blocco appena la sua query risponde.
 *
 * **`key={range}` sui boundary che leggono `range`.** Senza, un cambio di
 * periodo è un update dentro lo stesso transition di navigazione: React
 * tiene il contenuto vecchio finché la query nuova non risponde, quindi lo
 * skeleton non si vede mai. La `key` forza React a smontare e rimontare quel
 * `<Suspense>`. I boundary ancorati ad "adesso" non hanno la key: non
 * dipendono da `range`, quindi non devono ripartire quando cambia.
 *
 * **Il tetto sul pool viene prima della velocità del pannello.** Le letture
 * NON girano in parallelo: `runAdminRead` (`src/server/admin-sql.ts`) ne
 * lascia passare una per volta, così `/admin` non può mai togliere più di una
 * connessione delle dieci che servono la cassa. Il tempo totale è la somma
 * delle query, ed è per questo che il pannello ne fa poche.
 *
 * Corollario: l'ordine dei `<Suspense>` qui sotto è l'ordine della coda.
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
 * Sette giorni perché le letture che filtrano davvero su `created_at >=
 * rangeStart` — registrati di recente, classifiche esercenti — aggregano un
 * quarto delle righe rispetto a trenta. Le letture ancorate ad adesso (funnel,
 * trial, onboarding fermi, documenti in sospeso, utenti paganti) non lo
 * guardano per scelta.
 */
const DEFAULT_ADMIN_RANGE: AnalyticsRange = "7d";

export default async function AdminPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ range?: string }>;
}) {
  // Prima di qualunque altra cosa: non dipende dal layout (vedi
  // `src/server/admin-guard.ts`). Costa una chiamata già in `cache()`.
  await requireAdminOrNotFound();

  const range = parseAnalyticsRange(
    (await searchParams).range,
    DEFAULT_ADMIN_RANGE,
  );

  return (
    <div className="space-y-6">
      <AdminRangeTabs active={range} />

      {/* La griglia è qui e non nei componenti: `<Suspense>` non produce un
          nodo DOM, quindi card e scheletri restano figli diretti della griglia
          e si sostituiscono uno a uno senza spostare il layout. Il funnel
          prende due colonne su tre, i trial attivi la terza. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Suspense fallback={<AdminFunnelSkeleton />}>
          <AdminFunnelSection />
        </Suspense>
        <Suspense
          fallback={<AdminKpiCardsSkeleton count={1} label="trial attivi" />}
        >
          <AdminTrialActiveKpiSection />
        </Suspense>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Suspense
            key={`recent-profiles-${range}`}
            fallback={<AdminRecentProfilesSkeleton />}
          >
            <AdminRecentProfilesSection range={range} />
          </Suspense>
          <Suspense fallback={<AdminStalledOnboardingSkeleton />}>
            <AdminStalledOnboardingSection />
          </Suspense>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Suspense fallback={<AdminTrialExpiringSkeleton />}>
            <AdminTrialExpiringSection />
          </Suspense>
          <Suspense fallback={<AdminTrialActiveMerchantsSkeleton />}>
            <AdminTrialActiveMerchantsSection />
          </Suspense>
        </div>

        <Suspense fallback={<AdminStalePendingDocumentsSkeleton />}>
          <AdminStalePendingDocumentsSection />
        </Suspense>

        <details className="rounded-xl border border-dashed px-4">
          <summary className="cursor-pointer py-3 text-sm font-semibold">
            Altre metriche
          </summary>
          <div className="space-y-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Suspense
                key={`user-kpis-${range}`}
                fallback={
                  <AdminKpiCardsSkeleton
                    count={1}
                    sparklines={1}
                    label="nuovi utenti"
                  />
                }
              >
                <AdminUserKpisSection range={range} />
              </Suspense>
              <Suspense
                key={`document-kpis-${range}`}
                fallback={
                  <AdminKpiCardsSkeleton
                    count={2}
                    sparklines={2}
                    label="scontrini e incasso"
                  />
                }
              >
                <AdminDocumentKpisSection range={range} />
              </Suspense>
            </div>
            <Suspense fallback={<AdminPaidUsersSkeleton />}>
              <AdminPaidUsersSection />
            </Suspense>
            <Suspense
              key={`top-merchants-${range}`}
              fallback={<AdminTopMerchantsSkeleton />}
            >
              <AdminTopMerchantsSection range={range} />
            </Suspense>
          </div>
        </details>
      </div>
    </div>
  );
}
