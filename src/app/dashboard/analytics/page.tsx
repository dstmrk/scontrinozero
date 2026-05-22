import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import {
  type AnalyticsKpis,
  type PaymentBreakdownEntry,
  type ProductBreakdownEntry,
  type RevenuePoint,
  getAnalyticsKpis,
  getPaymentBreakdown,
  getProductBreakdown,
  getRevenueTimeseries,
} from "@/server/analytics-actions";
import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { ProFeatureGate } from "@/components/billing/pro-feature-gate";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getPlan } from "@/lib/plans";
import { logger } from "@/lib/logger";

const ZERO_KPIS: AnalyticsKpis = {
  revenueCents: 0,
  count: 0,
  aovCents: 0,
  voidCount: 0,
};

type ActionResult<T> = T | { error: string };

/**
 * Normalizza il risultato di una server action in `{ ok, data, error }`.
 * Una action puo' fallire come `{ error: string }` (kpis) o come non-array
 * (timeseries/breakdown ritornano `T[] | { error }`): la firma generica
 * copre entrambi tramite il discriminante `"error" in result`.
 */
function unwrap<T>(
  result: ActionResult<T>,
  fallback: T,
): { ok: boolean; data: T; error?: string } {
  if (result && typeof result === "object" && "error" in result) {
    return { ok: false, data: fallback, error: result.error };
  }
  return { ok: true, data: result };
}

export default async function AnalyticsPage() {
  const status = await getOnboardingStatus();
  if (!status.businessId) redirect("/onboarding");

  const user = await getAuthenticatedUser();
  const planInfo = await getPlan(user.id);

  if (planInfo.plan !== "pro" && planInfo.plan !== "unlimited") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Andamento ricavi e scontrini per il periodo selezionato.
          </p>
        </div>
        <ProFeatureGate
          plan={planInfo.plan}
          title="Analytics avanzata · Pro"
          description="Dashboard con KPI, andamento ricavi e ripartizione metodi di pagamento. Passa a Pro per attivarla."
        >
          <div />
        </ProFeatureGate>
      </div>
    );
  }

  const businessId = status.businessId;
  const [kpisRes, timeseriesRes, breakdownRes, productBreakdownRes] =
    await Promise.all([
      getAnalyticsKpis(businessId, "30d"),
      getRevenueTimeseries(businessId, "30d"),
      getPaymentBreakdown(businessId, "30d"),
      getProductBreakdown(businessId, "30d"),
    ]);

  const kpis = unwrap<AnalyticsKpis>(kpisRes, ZERO_KPIS);
  const timeseries = unwrap<RevenuePoint[]>(timeseriesRes, []);
  const breakdown = unwrap<PaymentBreakdownEntry[]>(breakdownRes, []);
  const productBreakdown = unwrap<ProductBreakdownEntry[]>(
    productBreakdownRes,
    [],
  );

  // Non collassare silenziosamente {error} in zero: un utente con DB
  // timeout o ownership glitch vedrebbe "0 €, 0 scontrini" indistinguibile
  // da un negozio senza scontrini. Logghiamo lato server (Sentry) e
  // passiamo un flag al client per mostrare un banner inline.
  const loadFailed =
    !kpis.ok || !timeseries.ok || !breakdown.ok || !productBreakdown.ok;

  if (loadFailed) {
    logger.warn(
      {
        userId: user.id,
        businessId,
        errorClass: "analytics_dashboard_load",
        kpisError: kpis.error,
        timeseriesError: timeseries.error,
        breakdownError: breakdown.error,
        productBreakdownError: productBreakdown.error,
      },
      "analytics: server action failed",
    );
  }

  return (
    <AnalyticsClient
      businessId={businessId}
      initialRange="30d"
      initialKpis={kpis.data}
      initialTimeseries={timeseries.data}
      initialBreakdown={breakdown.data}
      initialProductBreakdown={productBreakdown.data}
      initialLoadFailed={loadFailed}
    />
  );
}
