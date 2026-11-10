import { Text } from "@react-email/components";
import { emailStyles } from "./styles";
import { EmailLayout } from "./layout";
import { CONTACT_EMAIL } from "@/lib/contact";

type AccountDeletionEmailProps = Readonly<{
  email: string;
}>;

export function AccountDeletionEmail({ email }: AccountDeletionEmailProps) {
  return (
    <EmailLayout
      preview="Il tuo account ScontrinoZero è stato eliminato"
      header="none"
    >
      <Text style={emailStyles.text}>
        Confermiamo che l&apos;account associato all&apos;indirizzo{" "}
        <strong>{email}</strong> è stato eliminato.
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
        Per dubbi contattaci a <strong>{CONTACT_EMAIL}</strong>.
      </Text>
    </EmailLayout>
  );
}
