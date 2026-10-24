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
import { formatEmailDate } from "./format-date";

type CollaboratorInviteEmailProps = Readonly<{
  businessName: string | null;
  acceptLink: string;
  expiresAt: Date;
}>;

/**
 * Invito di un collaboratore (issue #1099). Il link apre la pagina dove il
 * collaboratore sceglie nome e password: è anche la prova che l'email è sua,
 * quindi non segue una conferma separata.
 */
export function CollaboratorInviteEmail({
  businessName,
  acceptLink,
  expiresAt,
}: CollaboratorInviteEmailProps) {
  const business = businessName ?? "un'attività";
  return (
    <Html lang="it">
      <Head />
      <Preview>{`${business} ti invita a emettere scontrini con ScontrinoZero`}</Preview>
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
              Hai ricevuto un invito da collaboratore
            </Heading>
            <Text style={emailStyles.text}>
              <strong>{business}</strong> ti ha invitato a emettere scontrini
              per suo conto con ScontrinoZero. Crea il tuo accesso con il
              pulsante qui sotto: ti chiederemo il nome e una password.
            </Text>
            <Button style={emailStyles.button} href={acceptLink}>
              Accetta l&apos;invito
            </Button>
            <Text style={fallback}>
              Se il pulsante non funziona, copia questo indirizzo nel browser:
              <br />
              <Link href={acceptLink} style={fallbackLink}>
                {acceptLink}
              </Link>
            </Text>
            <Text style={hint}>
              L&apos;invito vale fino al {formatEmailDate(expiresAt)} e si usa
              una volta sola. Se non conosci questa attività, ignora questa
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
