import type { Metadata } from "next";

import { AdminKpiCards } from "@/components/admin/admin-kpi-cards";
import { AdminRangeTabs } from "@/components/admin/admin-range-tabs";
import { getAdminKpis } from "@/server/admin-metrics";
import { parseAnalyticsRange } from "@/server/analytics-helpers";

/**
 * Pannello operatore — KPI aggregati su tutti i tenant.
 *
 * Server component puro: nessun JavaScript spedito al browser oltre a quello
 * del root layout, e nessuna server action esposta. Il periodo è un deep link
 * (`?range=`) validato contro l'allowlist di `parseAnalyticsRange`, che su
 * valore ignoto ricade sul default invece di lanciare (regola 19).
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
  const result = await getAdminKpis(range);

  return (
    <div className="space-y-6">
      <AdminRangeTabs active={range} />

      {"error" in result ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {result.error}
        </div>
      ) : (
        <AdminKpiCards kpis={result.kpis} />
      )}
    </div>
  );
}
