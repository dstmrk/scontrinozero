import { getOnboardingStatus } from "@/server/onboarding-actions";
import { PendingSalesBanner } from "@/components/dashboard/pending-sales-banner";
import { listStalePendingSales } from "@/lib/services/pending-verification";

/**
 * Legge le vendite rimaste in sospeso e rende il banner che le verifica
 * (REVIEW.md #103, slice 2).
 *
 * Server component a sé, montato dal layout dentro un `<Suspense>`: la query
 * non deve poter ritardare lo shell del dashboard, che è la parte da cui
 * dipende la performance percepita della cassa. Nel caso normale — nessuna
 * riga in sospeso — non rende nulla e il costo si ferma a una SELECT prefissata
 * `business_id`.
 *
 * `getOnboardingStatus` è deduplicata via `react/cache` con quella del layout:
 * non ripaga il round-trip.
 */
export async function PendingSalesSection() {
  const status = await getOnboardingStatus();
  if (!status.businessId) return null;

  const documents = await listStalePendingSales(status.businessId);
  if (documents.length === 0) return null;

  return (
    <PendingSalesBanner businessId={status.businessId} documents={documents} />
  );
}
