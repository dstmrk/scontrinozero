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

type AccountInactivityDeletionEmailProps = Readonly<{
  email: string;
}>;

/**
 * Conferma di cancellazione per inattività (GDPR). Distinta da
 * `AccountDeletionEmail` (self-service): esplicita il motivo — inattività
 * prolungata — per trasparenza verso l'interessato.
 */
export function AccountInactivityDeletionEmail({
  email,
}: AccountInactivityDeletionEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>Il tuo account ScontrinoZero è stato eliminato</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.content}>
            <Text style={emailStyles.text}>
              L&apos;account associato all&apos;indirizzo{" "}
              <strong>{email}</strong> è stato eliminato per inattività
              prolungata (oltre 12 mesi senza accessi né scontrini), in
              applicazione del principio di minimizzazione dei dati previsto dal
              GDPR.
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
              Vuoi tornare a usare ScontrinoZero? Puoi registrarti di nuovo in
              qualsiasi momento. Per dubbi contattaci a{" "}
              <strong>{CONTACT_EMAIL}</strong>.
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
