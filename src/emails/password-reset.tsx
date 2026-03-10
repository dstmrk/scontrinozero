import {
  Body,
  Button,
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

type PasswordResetEmailProps = Readonly<{
  resetLink: string;
}>;

export function PasswordResetEmail({ resetLink }: PasswordResetEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>Reimposta la tua password ScontrinoZero</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.header}>
            <Text style={emailStyles.headerTitle}>ScontrinoZero</Text>
            <Text style={emailStyles.headerSubtitle}>
              Registratore di cassa virtuale
            </Text>
          </Section>
          <Section style={emailStyles.content}>
            <Heading as="h2" style={emailStyles.subheading}>
              Reimposta la tua password
            </Heading>
            <Text style={emailStyles.text}>
              Abbiamo ricevuto una richiesta di reimpostazione della password
              per il tuo account ScontrinoZero.
            </Text>
            <Text style={emailStyles.text}>
              Clicca sul pulsante qui sotto per scegliere una nuova password. Il
              link è valido per 1 ora.
            </Text>
            <Button style={emailStyles.button} href={resetLink}>
              Reimposta password
            </Button>
            <Text style={hint}>
              Se non hai richiesto il reset della password, ignora questa email.
              Il tuo account è al sicuro.
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

const hint = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "16px 0 0",
};
