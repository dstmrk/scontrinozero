import { Text } from "@react-email/components";
import { emailStyles } from "./styles";
import { EmailLayout } from "./layout";
import { CONTACT_EMAIL } from "@/lib/contact";
import { formatEmailDate } from "./format-date";

type AccountInactivityDeletionEmailProps = Readonly<{
  email: string;
  /** Ultimo accesso, visita o scontrino prima della cancellazione. */
  lastActivityAt: Date;
}>;

/**
 * Conferma di cancellazione per inattività (GDPR). Distinta da
 * `AccountDeletionEmail` (self-service): esplicita il motivo — inattività
 * prolungata — per trasparenza verso l'interessato.
 */
export function AccountInactivityDeletionEmail({
  email,
  lastActivityAt,
}: AccountInactivityDeletionEmailProps) {
  return (
    <EmailLayout
      preview="Il tuo account ScontrinoZero è stato eliminato"
      header="none"
    >
      <Text style={emailStyles.text}>
        L&apos;account associato all&apos;indirizzo <strong>{email}</strong> è
        stato eliminato per inattività prolungata (nessun accesso né scontrino
        dal {formatEmailDate(lastActivityAt)}), in applicazione del principio di
        minimizzazione dei dati previsto dal GDPR.
      </Text>
      <Text style={emailStyles.text}>
        I tuoi dati personali (profilo, credenziali, scontrini) sono stati
        rimossi dai sistemi di ScontrinoZero.
      </Text>
      <Text style={emailStyles.text}>
        I documenti commerciali già trasmessi all&apos;Agenzia delle Entrate
        restano disponibili sul portale <strong>Fatture e Corrispettivi</strong>
        , accessibile con le tue credenziali Fisconline.
      </Text>
      <Text style={emailStyles.text}>
        Vuoi tornare a usare ScontrinoZero? Puoi registrarti di nuovo in
        qualsiasi momento. Per dubbi contattaci a{" "}
        <strong>{CONTACT_EMAIL}</strong>.
      </Text>
    </EmailLayout>
  );
}
