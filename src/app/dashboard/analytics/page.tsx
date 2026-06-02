import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import {
  type AnalyticsKpis,
  type PaymentBreakdownEntry,
  type RevenuePoint,
  getAnalyticsKpis,
  getPaymentBreakdown,
  getRevenueTimeseries,
} from "@/server/analytics-actions";
import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { canUsePro, getPlan } from "@/lib/plans";

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
  const businessId = status.businessId;

  // KPI base: disponibili a ogni piano (Starter incluso).
  const kpis = await getAnalyticsKpis(businessId, "30d");
  const safeKpis: AnalyticsKpis = "error" in kpis ? ZERO_KPIS : kpis;

  // Grafico ricavi + ripartizione pagamenti: solo Pro/Unlimited.
  let safeTimeseries: RevenuePoint[] = [];
  let safeBreakdown: PaymentBreakdownEntry[] = [];
  if (canUsePro(planInfo.plan)) {
    const [timeseries, breakdown] = await Promise.all([
      getRevenueTimeseries(businessId, "30d"),
      getPaymentBreakdown(businessId, "30d"),
    ]);
    safeTimeseries = Array.isArray(timeseries) ? timeseries : [];
    safeBreakdown = Array.isArray(breakdown) ? breakdown : [];
  }

  return (
    <AnalyticsClient
      businessId={businessId}
      plan={planInfo.plan}
      initialRange="30d"
      initialKpis={safeKpis}
      initialTimeseries={safeTimeseries}
      initialBreakdown={safeBreakdown}
    />
  );
}
