"use client";

import Link from "next/link";
import { useIsCollaborator } from "@/components/dashboard/member-role";
import { BILLING_SETTINGS_HREF } from "@/lib/plans-shared";
import { WebBillingOnly } from "./web-billing-only";

/**
 * Messaggio "trial scaduto" con la frase "Attiva un piano" resa come link verso
 * la card "Piano e Abbonamento" nelle Impostazioni (`BILLING_SETTINGS_HREF`).
 *
 * Sorgente unica del testo: il messaggio piano (`TRIAL_EXPIRED_MESSAGE`) torna
 * dalle server action (cassa, annullo, catalogo) e i render site lo confrontano
 * per uguaglianza per decidere se montare questo componente al posto del testo
 * semplice. Link app→app (stesso origin) → `<Link>` di Next, non `appHref()`
 * (la regola 15 vale solo per marketing→app).
 *
 * Nel guscio nativo resta la sola constatazione, senza link né invito ad
 * attivare un piano (issue #1044, `WebBillingOnly`).
 *
 * Al collaboratore la prova è quella dell'attività, e il piano lo attiva il
 * titolare: niente link all'acquisto (issue #1099).
 *
 * Ritorna un frammento inline: ogni call site lo avvolge nel proprio contenitore
 * di alert (`<p role="alert">`, banner rosso, ecc.).
 */
const TRIAL_EXPIRED_STATEMENT = "Il tuo periodo di prova è scaduto.";

export function TrialExpiredMessage() {
  const isCollaborator = useIsCollaborator();
  if (isCollaborator) {
    return (
      <>
        Il periodo di prova dell&apos;attività è scaduto: chiedi al titolare di
        attivare un piano.
      </>
    );
  }

  return (
    <WebBillingOnly nativeFallback={TRIAL_EXPIRED_STATEMENT}>
      {TRIAL_EXPIRED_STATEMENT}{" "}
      <Link href={BILLING_SETTINGS_HREF} className="font-medium underline">
        Attiva un piano
      </Link>{" "}
      per continuare.
    </WebBillingOnly>
  );
}
