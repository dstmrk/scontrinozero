import Link from "next/link";
import { BILLING_SETTINGS_HREF } from "@/lib/plans-shared";

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
 * Ritorna un frammento inline: ogni call site lo avvolge nel proprio contenitore
 * di alert (`<p role="alert">`, banner rosso, ecc.).
 */
export function TrialExpiredMessage() {
  return (
    <>
      Il tuo periodo di prova è scaduto.{" "}
      <Link href={BILLING_SETTINGS_HREF} className="font-medium underline">
        Attiva un piano
      </Link>{" "}
      per continuare.
    </>
  );
}
