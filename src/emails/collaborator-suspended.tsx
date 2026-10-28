import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";
import { CONTACT_EMAIL } from "@/lib/contact";

type CollaboratorSuspendedEmailProps = Readonly<{
  businessName: string | null;
}>;

export function collaboratorSuspendedSubject(
  businessName: string | null,
): string {
  return businessName
    ? `Il piano di ${businessName} non include più i collaboratori`
    : "Il piano dell'attività non include più i collaboratori";
}

/**
 * Al collaboratore, quando il titolare lascia il piano Team (issue #1099,
 * decisione 3 sul commento delle decisioni). Nessun link: l'acquisto non è
 * suo (decisione 18), e l'app gli mostra già lo stesso avviso al prossimo
 * accesso.
 */
export function CollaboratorSuspendedEmail({
  businessName,
}: CollaboratorSuspendedEmailProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>{collaboratorSuspendedSubject(businessName)}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.content}>
            <Text style={emailStyles.text}>
              Il piano ScontrinoZero di{" "}
              <strong>{businessName ?? "l'attività"}</strong> non include più i
              collaboratori, quindi per ora non puoi emettere scontrini,
              annullarli o fare resi.
            </Text>
            <Text style={emailStyles.text}>
              Il tuo account resta: puoi consultare i tuoi scontrini e
              scaricarne i PDF. Se l&apos;attività torna al piano Team riprendi
              a emettere come prima.
            </Text>
            <Text style={emailStyles.text}>
              Per sapere quando, chiedi al titolare. Per dubbi sul servizio
              scrivici a <strong>{CONTACT_EMAIL}</strong>.
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
