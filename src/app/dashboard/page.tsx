import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { getCatalogItems } from "@/server/catalog-actions";
import { CatalogoClient } from "@/components/catalogo/catalogo-client";
import { PlanUnavailable } from "@/components/dashboard/plan-unavailable";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { canUseDashboardCashier, getPlanSafe } from "@/lib/plans";

/**
 * Homepage del dashboard — mostra il catalogo prodotti.
 * Pre-fetcha gli articoli server-side e li passa al client come initialData.
 */
export default async function DashboardPage() {
  const status = await getOnboardingStatus();

  if (!status.businessId) {
    redirect("/onboarding");
  }

  // I piani developer_* gestiscono il catalogo via API, non dalla UI.
  // `getAuthenticatedUser` è ora deduplicata via React cache() (chiamata anche
  // dentro getOnboardingStatus sopra), quindi non ripaga il round-trip verso
  // Supabase Auth. `getPlan` e `getCatalogItems` sono indipendenti tra loro →
  // parallelizzati con Promise.all per evitare il waterfall di await sequenziali.
  const user = await getAuthenticatedUser();
  const [planResult, initialData] = await Promise.all([
    getPlanSafe(user.id, "dashboardPage"),
    getCatalogItems(status.businessId),
  ]);

  // `getPlanSafe` e non `getPlan` (REVIEW.md #85): senza il degrado, un profilo
  // orfano o un `57014` sotto contention farebbero risalire il throw fino al
  // boundary, vanificando la degradazione che `getCatalogItems` fa apposta
  // nella stessa `Promise.all` — stesso DB, stessa richiesta, stesso errore.
  // Niente `try/catch` intorno alla regione: il `redirect()` qui sotto funziona
  // lanciando `NEXT_REDIRECT` e un catch largo se lo mangerebbe.
  if (!planResult.ok) {
    return <PlanUnavailable message={planResult.error} />;
  }

  if (!canUseDashboardCashier(planResult.info.plan)) {
    redirect("/dashboard/settings#api-keys");
  }

  return (
    <CatalogoClient businessId={status.businessId} initialData={initialData} />
  );
}
