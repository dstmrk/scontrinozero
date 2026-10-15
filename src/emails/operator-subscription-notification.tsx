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

type OperatorSubscriptionNotificationEmailProps = Readonly<{
  firstName: string;
  lastName: string;
  email: string;
  /** Titolo dell'evento, es. "Nuovo abbonamento". */
  title: string;
  /** Piano risultante, es. "Pro annuale". */
  planLabel: string;
  /** Piano di partenza, solo per i cambi piano. */
  previousPlanLabel?: string;
  /** Data di fine accesso, solo per la disdetta programmata. */
  endsAtLabel?: string;
}>;

export function OperatorSubscriptionNotificationEmail({
  firstName,
  lastName,
  email,
  title,
  planLabel,
  previousPlanLabel,
  endsAtLabel,
}: OperatorSubscriptionNotificationEmailProps) {
  const fullName = `${firstName} ${lastName}`.trim();
  return (
    <Html lang="it">
      <Head />
      <Preview>
        {title}: {planLabel}
      </Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.header}>
            <Text style={emailStyles.headerTitle}>ScontrinoZero</Text>
            <Text style={emailStyles.headerSubtitle}>Notifica interna</Text>
          </Section>
          <Section style={emailStyles.content}>
            <Heading as="h2" style={emailStyles.subheading}>
              {title}
            </Heading>
            <Text style={emailStyles.text}>
              <strong>Nome:</strong> {fullName || "(non fornito)"}
            </Text>
            <Text style={emailStyles.text}>
              <strong>Email:</strong> {email}
            </Text>
            <Text style={emailStyles.text}>
              <strong>Piano:</strong> {planLabel}
            </Text>
            {previousPlanLabel ? (
              <Text style={emailStyles.text}>
                <strong>Piano precedente:</strong> {previousPlanLabel}
              </Text>
            ) : null}
            {endsAtLabel ? (
              <Text style={emailStyles.text}>
                <strong>Attivo fino al:</strong> {endsAtLabel}
              </Text>
            ) : null}
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
