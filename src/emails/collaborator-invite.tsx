import { Button, Heading, Text } from "@react-email/components";
import { emailStyles } from "./styles";
import { EmailLayout, EmailLinkFallback } from "./layout";
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
    <EmailLayout
      preview={`${business} ti invita a emettere scontrini con ScontrinoZero`}
      header="product"
    >
      <Heading as="h2" style={emailStyles.subheading}>
        Hai ricevuto un invito da collaboratore
      </Heading>
      <Text style={emailStyles.text}>
        <strong>{business}</strong> ti ha invitato a emettere scontrini per suo
        conto con ScontrinoZero. Crea il tuo accesso con il pulsante qui sotto:
        ti chiederemo il nome e una password.
      </Text>
      <Button style={emailStyles.button} href={acceptLink}>
        Accetta l&apos;invito
      </Button>
      <EmailLinkFallback href={acceptLink} />
      <Text style={emailStyles.hint}>
        L&apos;invito vale fino al {formatEmailDate(expiresAt)} e si usa una
        volta sola. Se non conosci questa attività, ignora questa email.
      </Text>
    </EmailLayout>
  );
}
