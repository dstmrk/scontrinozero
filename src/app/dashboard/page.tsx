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
  const user = await getAuthenticatedUser();
  const planInfo = await getPlan(user.id);
  if (!canUseDashboardCashier(planInfo.plan)) {
    redirect("/dashboard/settings#api-keys");
  }

  const initialData = await getCatalogItems(status.businessId);

  return (
    <CatalogoClient businessId={status.businessId} initialData={initialData} />
  );
}
