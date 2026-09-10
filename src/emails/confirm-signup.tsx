import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";

type ConfirmSignupEmailProps = Readonly<{
  confirmLink: string;
}>;

export function ConfirmSignupEmail({ confirmLink }: ConfirmSignupEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>Conferma il tuo indirizzo email e attiva ScontrinoZero</Preview>
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
              Conferma il tuo account
            </Heading>
            <Text style={emailStyles.text}>
              Benvenuto in ScontrinoZero! Clicca sul pulsante qui sotto per
              confermare il tuo indirizzo email e attivare l&apos;account.
            </Text>
            <Button style={emailStyles.button} href={confirmLink}>
              Conferma email
            </Button>
            {/*
              Stesso link in chiaro sotto il pulsante: chi legge la posta in un
              client che degrada l'HTML vedrebbe altrimenti una mail senza
              alcun modo di confermare, e resterebbe fuori dal proprio account
              senza capire perché.
            */}
            <Text style={fallback}>
              Se il pulsante non funziona, copia questo indirizzo nel browser:
              <br />
              <Link href={confirmLink} style={fallbackLink}>
                {confirmLink}
              </Link>
            </Text>
            <Text style={hint}>
              Se non hai creato un account su ScontrinoZero, ignora questa
              email.
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

const fallback = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "20px 0 0",
};

const fallbackLink = {
  color: "#009689",
  wordBreak: "break-all" as const,
};

const hint = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "16px 0 0",
};
