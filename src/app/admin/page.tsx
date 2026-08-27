import { Suspense } from "react";
import type { Metadata } from "next";

import { AdminRangeTabs } from "@/components/admin/admin-range-tabs";
import {
  AdminPaidUsersSkeleton,
  AdminRecentProfilesSkeleton,
  AdminTopMerchantsSkeleton,
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
  AdminTopMerchantsSection,
  AdminTrialExpiringSection,
  AdminUserKpisSection,
} from "./sections";

/**
 * Pannello operatore — KPI ed elenchi aggregati su tutti i tenant.
 *
 * Server component puro: nessun JavaScript spedito al browser oltre a quello
 * del root layout, e nessuna server action esposta. Il periodo è un deep link
 * (`?range=`) validato contro l'allowlist di `parseAnalyticsRange`, che su
 * valore ignoto ricade sul default invece di lanciare (regola 19).
 *
 * **La pagina non aspetta nessuna query.** Il guscio — selettore di periodo e
 * scheletri — esce subito; le sei letture stanno dietro ad altrettanti
 * `<Suspense>` e Next manda in streaming ogni blocco appena la sua query
 * risponde. Prima era un solo `await Promise.all(...)` in cima: nessun byte
 * di HTML partiva finché non c'era l'ultimo dato, e la scansione dello storico
 * scontrini si portava dietro anche le card che erano pronte da un pezzo.
 *
 * **Il tetto sul pool viene prima della velocità del pannello.** Le sei letture
 * NON girano in parallelo: `runAdminRead` (`src/server/admin-sql.ts`) ne lascia
 * passare una per volta, così `/admin` non può mai togliere più di una
 * connessione delle dieci che servono la cassa. Il tempo totale resta quindi la
 * somma delle sei query, com'era prima; quello che cambia è che si vede
 * arrivare il pannello un pezzo alla volta invece di fissare una pagina bianca.
 *
 * Corollario: l'ordine dei `<Suspense>` qui sotto è l'ordine della coda. I KPI
 * stanno davanti perché sono la parte che si guarda per prima.
 */
export const metadata: Metadata = {
  title: "Pannello operatore",
  robots: { index: false, follow: false },
};

/**
 * Periodo aperto per default dal pannello, **più stretto** del default
 * dell'analytics esercente (`DEFAULT_ANALYTICS_RANGE`, 30 giorni), che resta
 * intoccato: è un piano a pagamento e non si sposta di sotto ai clienti.
 *
 * Sette giorni perché due delle sei letture — classifiche esercenti e
 * registrati di recente — filtrano davvero su `created_at >= rangeStart`, e
 * lì un quarto del periodo è un quarto delle righe da aggregare. Le altre
 * quattro non ne beneficiano: la query scontrini legge `created_at < rangeEnd`,
 * cioè tutto lo storico a prescindere, e trial/paganti non guardano il range.
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
        {/* `sparklines` rispecchia il gruppo vero — 1 card su 3 fra gli
            utenti, 2 su 3 fra gli scontrini — così le card non cambiano
            altezza quando il contenuto prende il posto dello scheletro. */}
        <Suspense
          fallback={
            <AdminKpiCardsSkeleton
              count={3}
              sparklines={1}
              label="metriche utenti"
            />
          }
        >
          <AdminUserKpisSection range={range} />
        </Suspense>
        <Suspense
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
        <Suspense fallback={<AdminTopMerchantsSkeleton />}>
          <AdminTopMerchantsSection range={range} />
        </Suspense>
        <Suspense fallback={<AdminTrialExpiringSkeleton />}>
          <AdminTrialExpiringSection />
        </Suspense>
        <Suspense fallback={<AdminPaidUsersSkeleton />}>
          <AdminPaidUsersSection />
        </Suspense>
        <Suspense fallback={<AdminRecentProfilesSkeleton />}>
          <AdminRecentProfilesSection range={range} />
        </Suspense>
      </div>
    </div>
  );
}
