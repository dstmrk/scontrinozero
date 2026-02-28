import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { searchReceipts } from "@/server/storico-actions";
import { StoricoClient } from "@/components/storico/storico-client";

/**
 * Pre-fetch ultimi 30 giorni di scontrini (SALE) e passa i dati al client.
 * La ricerca avviene sul DB locale — nessuna chiamata AdE al caricamento pagina.
 */
export default async function StoricoPage() {
  const status = await getOnboardingStatus();

  if (!status.businessId) {
    redirect("/onboarding");
  }

  const todayStr = new Date().toISOString().split("T")[0];

  const initialData = await searchReceipts(status.businessId, {
    dateFrom: todayStr,
    dateTo: todayStr,
    status: "ACCEPTED",
  });

  return (
    <StoricoClient businessId={status.businessId} initialData={initialData} />
  );
}
