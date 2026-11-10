import { Heading, Text } from "@react-email/components";
import { emailStyles } from "./styles";
import { EmailLayout } from "./layout";

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
    <EmailLayout preview={`${title}: ${planLabel}`} header="internal">
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
    </EmailLayout>
  );
}
