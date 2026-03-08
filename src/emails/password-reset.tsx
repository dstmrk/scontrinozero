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

type PasswordResetEmailProps = {
  resetLink: string;
};

export function PasswordResetEmail({ resetLink }: PasswordResetEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>Reimposta la tua password ScontrinoZero</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>ScontrinoZero</Heading>
          <Hr style={hr} />
          <Section>
            <Heading as="h2" style={subheading}>
              Reimposta la tua password
            </Heading>
            <Text style={text}>
              Abbiamo ricevuto una richiesta di reimpostazione della password
              per il tuo account ScontrinoZero.
            </Text>
            <Text style={text}>
              Clicca sul pulsante qui sotto per scegliere una nuova password. Il
              link è valido per 1 ora.
            </Text>
            <Button style={button} href={resetLink}>
              Reimposta password
            </Button>
            <Text style={hint}>
              Se non hai richiesto il reset della password, ignora questa email.
              Il tuo account è al sicuro.
            </Text>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>ScontrinoZero · scontrinozero.it</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#f9fafb",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  padding: "40px",
  borderRadius: "8px",
  maxWidth: "560px",
};

const heading = {
  fontSize: "28px",
  fontWeight: "700",
  color: "#111827",
  margin: "0 0 16px",
};

const subheading = {
  fontSize: "20px",
  fontWeight: "600",
  color: "#111827",
  margin: "24px 0 12px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "16px 0",
};

const text = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#374151",
  margin: "12px 0",
};

const button = {
  backgroundColor: "#111827",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
  display: "inline-block",
  margin: "16px 0",
};

const hint = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#6b7280",
  margin: "16px 0 0",
};

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  margin: "0",
};
