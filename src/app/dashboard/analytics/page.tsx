import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import {
  type AnalyticsKpis,
  getAnalyticsBundle,
  getStarterKpis,
} from "@/server/analytics-actions";
import { parseAnalyticsRange } from "@/server/analytics-helpers";
import { AnalyticsClient } from "@/components/analytics/analytics-client";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { ProFeatureGate } from "@/components/billing/pro-feature-gate";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { canUsePro, getPlan } from "@/lib/plans";
import { logger } from "@/lib/logger";

const ZERO_KPIS: AnalyticsKpis = {
  revenueCents: 0,
  count: 0,
  aovCents: 0,
  voidCount: 0,
};

export default async function AnalyticsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ range?: string }>;
}) {
  const status = await getOnboardingStatus();
  if (!status.businessId) redirect("/onboarding");

  const user = await getAuthenticatedUser();
  const planInfo = await getPlan(user.id);
  const businessId = status.businessId;

  // Piano base (Starter, trial scaduto e altri non-Pro): solo i 4 KPI su
  // finestra fissa 30 giorni rolling — niente selettore range, niente grafici
  // (quindi niente recharts caricato). I grafici diventano una singola card
  // upsell "Pro". Un trial ATTIVO è trattato come Pro (canUsePro con
  // trialStartedAt) e vede il bundle completo: assaggio della feature Pro.
  if (
    !canUsePro(planInfo.plan, planInfo.planExpiresAt, planInfo.trialStartedAt)
  ) {
    const starterRes = await getStarterKpis(businessId);
    const starterFailed = "error" in starterRes;
    if (starterFailed) {
      logger.warn(
        {
          userId: user.id,
          businessId,
          errorClass: "analytics_starter_kpis_load",
          actionError: starterRes.error,
        },
        "analytics: starter KPIs load failed",
      );
    }
    const kpis = starterFailed ? ZERO_KPIS : starterRes.kpis;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ricavi e scontrini degli ultimi 30 giorni.
          </p>
        </div>

        {starterFailed && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
          >
            Impossibile caricare i dati. Riprova tra qualche istante.
          </div>
        )}

        <KpiCards kpis={kpis} />

        <ProFeatureGate
          plan={planInfo.plan}
          trialStartedAt={planInfo.trialStartedAt}
          title="Grafici avanzati · Pro"
          description="Andamento ricavi giornaliero, ripartizione per metodo di pagamento e prodotti più venduti, con periodi fino a inizio anno. Passa a Pro per sbloccarli."
        >
          <div />
        </ProFeatureGate>
      </div>
    );
  }

  // Deep link: `?range=` permette di condividere/bookmark un periodo specifico
  // (es. /dashboard/analytics?range=90d), coerente con i filtri URL dello
  // storico. Valore invalido o assente → default 30d (no throw, regola 19).
  const range = parseAnalyticsRange((await searchParams).range);
  const bundle = await getAnalyticsBundle(businessId, range);

  // Non collassare silenziosamente {error} in zero: un utente con DB
  // timeout o ownership glitch vedrebbe "0 €, 0 scontrini" indistinguibile
  // da un negozio senza scontrini. Logghiamo lato server (Sentry) e
  // passiamo un flag al client per mostrare un banner inline.
  const loadFailed = "error" in bundle;

  if (loadFailed) {
    logger.warn(
      {
        userId: user.id,
        businessId,
        errorClass: "analytics_dashboard_load",
        bundleError: bundle.error,
      },
      "analytics: server action failed",
    );
  }

  return (
    <AnalyticsClient
      businessId={businessId}
      initialRange={range}
      initialKpis={loadFailed ? ZERO_KPIS : bundle.kpis}
      initialTimeseries={loadFailed ? [] : bundle.timeseries}
      initialBreakdown={loadFailed ? [] : bundle.breakdown}
      initialProductBreakdown={loadFailed ? [] : bundle.productBreakdown}
      initialLoadFailed={loadFailed}
    />
  );
}
