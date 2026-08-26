import type { Metadata } from "next";

import { AdminDirectoryTables } from "@/components/admin/admin-directory-tables";
import { AdminKpiCards } from "@/components/admin/admin-kpi-cards";
import { AdminRangeTabs } from "@/components/admin/admin-range-tabs";
import { getAdminDirectory } from "@/server/admin-directory";
import { getAdminKpis } from "@/server/admin-metrics";
import { parseAnalyticsRange } from "@/server/analytics-helpers";

/**
 * Pannello operatore — KPI ed elenchi aggregati su tutti i tenant.
 *
 * Server component puro: nessun JavaScript spedito al browser oltre a quello
 * del root layout, e nessuna server action esposta. Il periodo è un deep link
 * (`?range=`) validato contro l'allowlist di `parseAnalyticsRange`, che su
 * valore ignoto ricade sul default invece di lanciare (regola 19).
 *
 * KPI ed elenchi sono letti in **parallelo** e falliscono in modo
 * indipendente: un timeout sulle classifiche non deve portarsi via anche le
 * card, che sono la parte che si guarda per prima.
 */
export const metadata: Metadata = {
  title: "Pannello operatore",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ range?: string }>;
}) {
  const range = parseAnalyticsRange((await searchParams).range);
  const [kpis, directory] = await Promise.all([
    getAdminKpis(range),
    getAdminDirectory(range),
  ]);

  return (
    <div className="space-y-6">
      <AdminRangeTabs active={range} />

      {"error" in kpis ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {kpis.error}
        </div>
      ) : (
        <AdminKpiCards kpis={kpis.kpis} />
      )}

      {"error" in directory ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {directory.error}
        </div>
      ) : (
        <AdminDirectoryTables directory={directory.directory} />
      )}
    </div>
  );
}
