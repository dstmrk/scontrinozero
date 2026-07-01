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
import { CONTACT_EMAIL } from "@/lib/contact";

type AccountInactivityWarningEmailProps = Readonly<{
  firstName: string;
  deletionDate: Date;
  loginUrl: string;
}>;

/**
 * Preavviso di cancellazione per inattività (GDPR, minimizzazione dati). Inviato
 * ≥30 giorni prima della cancellazione effettiva. Basta un accesso per azzerare
 * il conteggio (lo sweep resetta il flag quando l'utente torna attivo).
 */
export function AccountInactivityWarningEmail({
  firstName,
  deletionDate,
  loginUrl,
}: AccountInactivityWarningEmailProps) {
  const formattedDate = deletionDate.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const greeting = firstName ? `Ciao ${firstName}, ` : "Ciao, ";

  return (
    <Html lang="it">
      <Head />
      <Preview>
        Il tuo account ScontrinoZero sta per essere eliminato per inattività
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
              Il tuo account sta per essere eliminato
            </Heading>
            <Text style={emailStyles.text}>
              {greeting}non registriamo attività sul tuo account ScontrinoZero
              da oltre 12 mesi. Per rispetto del principio di minimizzazione dei
              dati (GDPR), gli account inattivi vengono eliminati insieme ai
              dati collegati.
            </Text>
            <Text style={emailStyles.text}>
              Se non intervieni, il tuo account verrà eliminato definitivamente
              il <strong>{formattedDate}</strong>.
            </Text>
            <Text style={emailStyles.text}>
              <strong>Vuoi mantenerlo?</strong> Ti basta accedere:
              l&apos;accesso azzera il conteggio dell&apos;inattività.
            </Text>
            <Button style={emailStyles.button} href={loginUrl}>
              Accedi e mantieni l&apos;account
            </Button>
            <Text style={emailStyles.text}>
              I documenti commerciali già trasmessi all&apos;Agenzia delle
              Entrate restano comunque disponibili sul portale{" "}
              <strong>Fatture e Corrispettivi</strong>. Per dubbi scrivici a{" "}
              <strong>{CONTACT_EMAIL}</strong>.
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
