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
              In conformità al GDPR (art. 17), tutti i tuoi dati personali sono
              stati rimossi dai nostri sistemi.
            </Text>
            <Text style={emailStyles.text}>
              Per qualsiasi dubbio contattaci a{" "}
              <strong>supporto@scontrinozero.it</strong>.
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
