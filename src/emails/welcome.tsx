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

type WelcomeEmailProps = {
  email: string;
};

export function WelcomeEmail({ email }: WelcomeEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>
        Benvenuto in ScontrinoZero — il tuo registratore di cassa virtuale
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>ScontrinoZero</Heading>
          <Hr style={hr} />
          <Section>
            <Heading as="h2" style={subheading}>
              Benvenuto!
            </Heading>
            <Text style={text}>
              Ciao, ti scriviamo per confermare che il tuo account è stato
              creato con successo per l&apos;indirizzo <strong>{email}</strong>.
            </Text>
            <Text style={text}>
              ScontrinoZero è il registratore di cassa virtuale che ti permette
              di emettere scontrini elettronici e trasmettere i corrispettivi
              all&apos;Agenzia delle Entrate direttamente dal tuo smartphone.
            </Text>
            <Button
              style={button}
              href={`${process.env.NEXT_PUBLIC_APP_URL ?? "https://scontrinozero.it"}/dashboard`}
            >
              Vai alla dashboard
            </Button>
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

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  margin: "0",
};
