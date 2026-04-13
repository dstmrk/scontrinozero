import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";
import { CONTACT_EMAIL } from "@/lib/contact";

type AccountDeletionEmailProps = Readonly<{
  email: string;
}>;

export function AccountDeletionEmail({ email }: AccountDeletionEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>Il tuo account ScontrinoZero è stato eliminato</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.content}>
            <Text style={emailStyles.text}>
              Confermiamo che l&apos;account associato all&apos;indirizzo{" "}
              <strong>{email}</strong> è stato eliminato.
            </Text>
            <Text style={emailStyles.text}>
              I tuoi dati personali (profilo, credenziali, scontrini) sono stati
              rimossi dai sistemi di ScontrinoZero.
            </Text>
            <Text style={emailStyles.text}>
              I documenti commerciali già trasmessi all&apos;Agenzia delle
              Entrate restano disponibili sul portale{" "}
              <strong>Fatture e Corrispettivi</strong>, accessibile con le tue
              credenziali Fisconline.
            </Text>
            <Text style={emailStyles.text}>
              Per dubbi contattaci a <strong>{CONTACT_EMAIL}</strong>.
            </Text>
          </Section>
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.footer}>
            ScontrinoZero · scontrinozero.it
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
