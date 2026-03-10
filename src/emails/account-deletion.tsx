import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";

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
          <Heading style={emailStyles.heading}>ScontrinoZero</Heading>
          <Hr style={emailStyles.hr} />
          <Section>
            <Heading as="h2" style={emailStyles.subheading}>
              Account eliminato
            </Heading>
            <Text style={emailStyles.text}>
              Confermiamo che l&apos;account associato all&apos;indirizzo{" "}
              <strong>{email}</strong> è stato eliminato con successo.
            </Text>
            <Text style={emailStyles.text}>
              In conformità al Regolamento GDPR (art. 17 — diritto alla
              cancellazione), tutti i tuoi dati personali sono stati rimossi dai
              nostri sistemi.
            </Text>
            <Text style={emailStyles.text}>
              Se non hai richiesto tu stesso l&apos;eliminazione
              dell&apos;account o ritieni che si tratti di un errore, contattaci
              all&apos;indirizzo <strong>supporto@scontrinozero.it</strong>.
            </Text>
          </Section>
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.footer}>
            ScontrinoZero · scontrinozero.it · Privacy Policy
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
