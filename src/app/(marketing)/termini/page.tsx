import { redirect } from "next/navigation";

// Aggiorna questo path quando pubblichi una nuova versione dei T&C.
// La versione corrente corrisponde a CURRENT_TERMS_VERSION in auth-actions.ts.
export default function TerminiPage() {
  redirect("/termini/v01");
}
