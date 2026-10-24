import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { collaboratorSuspendedError } from "@/lib/business-permissions";
import { getPlanSafe } from "@/lib/plans";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getOnboardingStatus } from "@/server/onboarding-actions";

/**
 * Avviso al collaboratore quando il piano del titolare non ammette
 * collaboratori, o la prova è scaduta (issue #1099). Emettere, annullare e
 * fare resi è bloccato dalle server action; lo storico e i PDF dei propri
 * documenti restano leggibili, così può ristampare uno scontrino a un cliente.
 *
 * Nello shell e non nella sola cassa: lo incontra prima di comporre una
 * vendita che non potrebbe emettere. Dietro `<Suspense>` come le altre sezioni
 * del layout; il piano si legge solo per il collaboratore, quindi per il
 * titolare il costo resta zero.
 */
export async function CollaboratorSuspendedSection() {
  const status = await getOnboardingStatus();
  if (status.membership?.role !== "collaborator") return null;

  const user = await getAuthenticatedUser();
  const planResult = await getPlanSafe(user.id, "collaboratorSuspendedSection");
  // Piano illeggibile: l'avviso è accessorio, e le action rispondono
  // comunque con il loro messaggio.
  if (!planResult.ok) return null;
  if (collaboratorSuspendedError(status.membership, planResult.info) === null) {
    return null;
  }

  return (
    <Alert variant="warning" className="mb-4">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        Al momento il piano dell&apos;attività non ti permette di emettere
        scontrini, annullarli o fare resi. Puoi consultare i tuoi scontrini e
        scaricarne i PDF. Per riprendere, chiedi al titolare.
      </AlertDescription>
    </Alert>
  );
}
