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
import type { LoginRejectionOutcome } from "@/lib/ade/verify-outcome";

type AdeCredentialsRejectedEmailProps = Readonly<{
  businessName: string | null;
  outcome: LoginRejectionOutcome;
  settingsUrl: string;
}>;

export function adeCredentialsRejectedSubject(
  outcome: LoginRejectionOutcome,
  businessName: string | null,
): string {
  const of = businessName ? `di ${businessName}` : "dell'attività";
  if (outcome === "password_expired") {
    return `La password Fisconline ${of} è scaduta`;
  }
  if (outcome === "account_locked") {
    return `L'utenza Fisconline ${of} è bloccata`;
  }
  return `L'Agenzia delle Entrate rifiuta le credenziali Fisconline ${of}`;
}

/**
 * Al titolare, quando l'AdE rifiuta le credenziali Fisconline dell'attività e
 * i login automatici si fermano (issue #1099). Parte solo con collaboratori
 * attivi: sono loro a restare fermi alla cassa, con un messaggio che li
 * manda dal titolare, mentre il titolare può non esserci.
 */
export function AdeCredentialsRejectedEmail({
  businessName,
  outcome,
  settingsUrl,
}: AdeCredentialsRejectedEmailProps) {
  const subject = adeCredentialsRejectedSubject(outcome, businessName);
  return (
    <Html lang="it">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.content}>
            <Heading as="h2" style={emailStyles.subheading}>
              {subject}
            </Heading>
            <Text style={emailStyles.text}>
              {outcome === "password_expired" &&
                "L'Agenzia delle Entrate ha rifiutato la password Fisconline salvata in ScontrinoZero perché è scaduta."}
              {outcome === "account_locked" &&
                "L'Agenzia delle Entrate ha bloccato l'utenza Fisconline salvata in ScontrinoZero. Non dipende dai dati salvati, che sono corretti."}
              {outcome === "auth_error" &&
                "L'Agenzia delle Entrate non accetta più le credenziali Fisconline salvate in ScontrinoZero. Succede di solito quando la password è stata cambiata sul portale e non nell'app."}
            </Text>
            <Text style={emailStyles.text}>
              Finché non le sistemi, né tu né i collaboratori potete emettere,
              annullare o fare resi da ScontrinoZero.
            </Text>
            <Text style={emailStyles.text}>
              {outcome === "password_expired" &&
                "Puoi cambiarla dalle impostazioni, nella card Credenziali AdE: l'app la aggiorna anche sul portale."}
              {outcome === "account_locked" &&
                "Per sbloccarla entra nel portale dell'Agenzia delle Entrate, poi verifica la connessione dalle impostazioni."}
              {outcome === "auth_error" &&
                "Aggiorna le credenziali dalle impostazioni, nella card Credenziali AdE, e verifica la connessione."}
            </Text>
            <Button style={emailStyles.button} href={settingsUrl}>
              Apri le impostazioni
            </Button>
            <Text style={emailStyles.text}>
              Per dubbi scrivici a <strong>{CONTACT_EMAIL}</strong>.
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
