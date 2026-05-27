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

type OperatorSignupNotificationEmailProps = Readonly<{
  firstName: string;
  lastName: string;
  email: string;
}>;

export function OperatorSignupNotificationEmail({
  firstName,
  lastName,
  email,
}: OperatorSignupNotificationEmailProps) {
  const fullName = `${firstName} ${lastName}`.trim();
  return (
    <Html lang="it">
      <Head />
      <Preview>Nuovo utente ha completato l&apos;onboarding</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.header}>
            <Text style={emailStyles.headerTitle}>ScontrinoZero</Text>
            <Text style={emailStyles.headerSubtitle}>Notifica interna</Text>
          </Section>
          <Section style={emailStyles.content}>
            <Heading as="h2" style={emailStyles.subheading}>
              Nuovo onboarding completato
            </Heading>
            <Text style={emailStyles.text}>
              <strong>Nome:</strong> {fullName || "(non fornito)"}
            </Text>
            <Text style={emailStyles.text}>
              <strong>Email:</strong> {email}
            </Text>
          </Section>
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.footer}>
            ScontrinoZero · notifica automatica
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
