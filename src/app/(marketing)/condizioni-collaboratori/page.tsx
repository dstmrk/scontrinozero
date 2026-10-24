import { redirect } from "next/navigation";
import { CURRENT_COLLABORATOR_TERMS_VERSION } from "@/lib/collaborator-invites";

// La versione corrente è quella che il titolare accetta prima del primo
// invito (`CURRENT_COLLABORATOR_TERMS_VERSION`): il redirect la segue da sé.
export default function CondizioniCollaboratoriPage() {
  redirect(`/condizioni-collaboratori/${CURRENT_COLLABORATOR_TERMS_VERSION}`);
}
