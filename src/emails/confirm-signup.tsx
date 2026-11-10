import { Button, Heading, Text } from "@react-email/components";
import { emailStyles } from "./styles";
import { EmailLayout, EmailLinkFallback } from "./layout";

type ConfirmSignupEmailProps = Readonly<{
  confirmLink: string;
}>;

export function ConfirmSignupEmail({ confirmLink }: ConfirmSignupEmailProps) {
  return (
    <EmailLayout
      preview="Conferma il tuo indirizzo email e attiva ScontrinoZero"
      header="product"
    >
      <Heading as="h2" style={emailStyles.subheading}>
        Conferma il tuo account
      </Heading>
      <Text style={emailStyles.text}>
        Benvenuto in ScontrinoZero! Clicca sul pulsante qui sotto per confermare
        il tuo indirizzo email e attivare l&apos;account.
      </Text>
      <Button style={emailStyles.button} href={confirmLink}>
        Conferma email
      </Button>
      <EmailLinkFallback href={confirmLink} />
      <Text style={emailStyles.hint}>
        Se non hai creato un account su ScontrinoZero, ignora questa email.
      </Text>
    </EmailLayout>
  );
}
