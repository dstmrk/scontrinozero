import { Button, Heading, Text } from "@react-email/components";
import { emailStyles } from "./styles";
import { EmailLayout } from "./layout";

type PasswordResetEmailProps = Readonly<{
  resetLink: string;
}>;

export function PasswordResetEmail({ resetLink }: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview="Reimposta la tua password ScontrinoZero"
      header="product"
    >
      <Heading as="h2" style={emailStyles.subheading}>
        Reimposta la tua password
      </Heading>
      <Text style={emailStyles.text}>
        Abbiamo ricevuto una richiesta di reimpostazione della password per il
        tuo account ScontrinoZero.
      </Text>
      <Text style={emailStyles.text}>
        Clicca sul pulsante qui sotto per scegliere una nuova password. Il link
        è valido per 1 ora.
      </Text>
      <Button style={emailStyles.button} href={resetLink}>
        Reimposta password
      </Button>
      <Text style={emailStyles.hint}>
        Se non hai richiesto il reset della password, ignora questa email. Il
        tuo account è al sicuro.
      </Text>
    </EmailLayout>
  );
}
