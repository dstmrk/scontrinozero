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

type TrialExpiringEmailProps = Readonly<{
  firstName: string;
  trialExpiresAt: Date;
  dashboardUrl: string;
}>;

export function TrialExpiringEmail({
  firstName,
  trialExpiresAt,
  dashboardUrl,
}: TrialExpiringEmailProps) {
  const formattedDate = trialExpiresAt.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Html lang="it">
      <Head />
      <Preview>
        Il tuo periodo di prova scade tra 7 giorni — scegli il tuo piano
      </Preview>
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
              Il tuo periodo di prova sta per scadere
            </Heading>
            <Text style={emailStyles.text}>
              Ciao {firstName}, il tuo periodo di prova gratuito scade il{" "}
              <strong>{formattedDate}</strong>.
            </Text>
            <Text style={emailStyles.text}>
              Per continuare ad usare ScontrinoZero senza interruzioni, scegli
              il piano più adatto alla tua attività. Starter a soli €4.99/mese,
              Pro a €8.99/mese.
            </Text>
            <Button style={emailStyles.button} href={dashboardUrl}>
              Scegli il tuo piano
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
