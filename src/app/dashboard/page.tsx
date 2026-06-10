import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { getCatalogItems } from "@/server/catalog-actions";
import { CatalogoClient } from "@/components/catalogo/catalogo-client";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { canUseDashboardCashier, getPlan } from "@/lib/plans";

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
  const [planInfo, initialData] = await Promise.all([
    getPlan(user.id),
    getCatalogItems(status.businessId),
  ]);
  if (!canUseDashboardCashier(planInfo.plan)) {
    redirect("/dashboard/settings#api-keys");
  }

  return (
    <CatalogoClient businessId={status.businessId} initialData={initialData} />
  );
}
