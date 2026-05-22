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
  const [kpis, timeseries, breakdown, productBreakdown] = await Promise.all([
    getAnalyticsKpis(businessId, "30d"),
    getRevenueTimeseries(businessId, "30d"),
    getPaymentBreakdown(businessId, "30d"),
    getProductBreakdown(businessId, "30d"),
  ]);

  // Non collassare silenziosamente {error} in zero: un utente con DB
  // timeout o ownership glitch vedrebbe "0 €, 0 scontrini" indistinguibile
  // da un negozio senza scontrini. Logghiamo lato server (Sentry) e
  // passiamo un flag al client per mostrare un banner inline.
  const kpisFailed = "error" in kpis;
  const timeseriesFailed = !Array.isArray(timeseries);
  const breakdownFailed = !Array.isArray(breakdown);
  const productBreakdownFailed = !Array.isArray(productBreakdown);
  const loadFailed =
    kpisFailed || timeseriesFailed || breakdownFailed || productBreakdownFailed;

  if (loadFailed) {
    logger.warn(
      {
        userId: user.id,
        businessId,
        errorClass: "analytics_dashboard_load",
        kpisError: kpisFailed ? kpis.error : undefined,
        timeseriesError: timeseriesFailed ? timeseries.error : undefined,
        breakdownError: breakdownFailed ? breakdown.error : undefined,
        productBreakdownError: productBreakdownFailed
          ? productBreakdown.error
          : undefined,
      },
      "analytics: server action failed",
    );
  }

  const safeKpis: AnalyticsKpis = kpisFailed ? ZERO_KPIS : kpis;
  const safeTimeseries: RevenuePoint[] = Array.isArray(timeseries)
    ? timeseries
    : [];
  const safeBreakdown: PaymentBreakdownEntry[] = Array.isArray(breakdown)
    ? breakdown
    : [];
  const safeProductBreakdown: ProductBreakdownEntry[] = Array.isArray(
    productBreakdown,
  )
    ? productBreakdown
    : [];

  return (
    <AnalyticsClient
      businessId={businessId}
      initialRange="30d"
      initialKpis={safeKpis}
      initialTimeseries={safeTimeseries}
      initialBreakdown={safeBreakdown}
      initialProductBreakdown={safeProductBreakdown}
      initialLoadFailed={loadFailed}
    />
  );
}
