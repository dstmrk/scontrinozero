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

type WelcomeEmailProps = Readonly<{
  email: string;
}>;

export function WelcomeEmail({ email }: WelcomeEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>
        Benvenuto in ScontrinoZero — il tuo registratore di cassa virtuale
      </Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Heading style={emailStyles.heading}>ScontrinoZero</Heading>
          <Hr style={emailStyles.hr} />
          <Section>
            <Heading as="h2" style={emailStyles.subheading}>
              Benvenuto!
            </Heading>
            <Text style={emailStyles.text}>
              Ciao, ti scriviamo per confermare che il tuo account è stato
              creato con successo per l&apos;indirizzo <strong>{email}</strong>.
            </Text>
            <Text style={emailStyles.text}>
              ScontrinoZero è il registratore di cassa virtuale che ti permette
              di emettere scontrini elettronici e trasmettere i corrispettivi
              all&apos;Agenzia delle Entrate direttamente dal tuo smartphone.
            </Text>
            <Button
              style={emailStyles.button}
              href={`${process.env.NEXT_PUBLIC_APP_URL ?? "https://scontrinozero.it"}/dashboard`}
            >
              Vai alla dashboard
            </Button>
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
