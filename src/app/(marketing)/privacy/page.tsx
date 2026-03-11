import { redirect } from "next/navigation";

// Aggiorna questo path quando pubblichi una nuova versione della Privacy Policy.
export default function PrivacyPage() {
  redirect("/privacy/v01");
}
