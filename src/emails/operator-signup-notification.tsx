import { Heading, Text } from "@react-email/components";
import { emailStyles } from "./styles";
import { EmailLayout } from "./layout";

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
    <EmailLayout
      preview="Nuovo utente ha completato l'onboarding"
      header="internal"
    >
      <Heading as="h2" style={emailStyles.subheading}>
        Nuovo onboarding completato
      </Heading>
      <Text style={emailStyles.text}>
        <strong>Nome:</strong> {fullName || "(non fornito)"}
      </Text>
      <Text style={emailStyles.text}>
        <strong>Email:</strong> {email}
      </Text>
    </EmailLayout>
  );
}
