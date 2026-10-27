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

/** Perché un collaboratore ha perso l'accesso (issue #1099). */
export type AccessEndedReason = "removed" | "left" | "owner-deleted";

type CollaboratorAccessEndedEmailProps = Readonly<{
  businessName: string | null;
  reason: AccessEndedReason;
}>;

export function collaboratorAccessEndedSubject(
  reason: AccessEndedReason,
  businessName: string | null,
): string {
  if (reason === "left")
    return "Il tuo account ScontrinoZero è stato eliminato";
  if (reason === "removed") {
    return businessName
      ? `Il tuo accesso a ${businessName} è stato rimosso`
      : "Il tuo accesso su ScontrinoZero è stato rimosso";
  }
  return businessName
    ? `L'account di ${businessName} su ScontrinoZero è stato eliminato`
    : "L'account dell'attività su ScontrinoZero è stato eliminato";
}

/**
 * Il collaboratore non ha più un account: l'ha rimosso il titolare, l'ha
 * eliminato lui, o il titolare ha cancellato l'account dell'attività. Nei
 * primi due casi i documenti che ha emesso restano all'attività; nel terzo se
 * ne vanno con lei.
 */
export function CollaboratorAccessEndedEmail({
  businessName,
  reason,
}: CollaboratorAccessEndedEmailProps) {
  const business = businessName ?? "l'attività";
  return (
    <Html lang="it">
      <Head />
      <Preview>{collaboratorAccessEndedSubject(reason, businessName)}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.content}>
            <Text style={emailStyles.text}>
              {reason === "removed" && (
                <>
                  <strong>{business}</strong> ha rimosso il tuo accesso da
                  collaboratore, e il tuo account ScontrinoZero è stato
                  eliminato.
                </>
              )}
              {reason === "left" && (
                <>
                  Come hai chiesto, il tuo account da collaboratore di{" "}
                  <strong>{business}</strong> è stato eliminato.
                </>
              )}
              {reason === "owner-deleted" && (
                <>
                  Il titolare di <strong>{business}</strong> ha eliminato
                  l&apos;account dell&apos;attività su ScontrinoZero, e con esso
                  il tuo accesso da collaboratore.
                </>
              )}
            </Text>
            {reason !== "owner-deleted" && (
              <Text style={emailStyles.text}>
                I documenti commerciali che hai emesso restano
                all&apos;attività.
              </Text>
            )}
            <Text style={emailStyles.text}>
              Per dubbi contattaci a <strong>{CONTACT_EMAIL}</strong>.
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
