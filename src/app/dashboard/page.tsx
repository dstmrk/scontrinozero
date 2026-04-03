import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { getCatalogItems } from "@/server/catalog-actions";
import { CatalogoClient } from "@/components/catalogo/catalogo-client";

/**
 * Homepage del dashboard — mostra il catalogo prodotti.
 * Pre-fetcha gli articoli server-side e li passa al client come initialData.
 */
export default async function DashboardPage() {
  const status = await getOnboardingStatus();

  if (!status.businessId) {
    redirect("/onboarding");
  }

  const initialData = await getCatalogItems(status.businessId);

  return (
    <CatalogoClient businessId={status.businessId} initialData={initialData} />
  );
}
