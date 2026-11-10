import { Button, Heading, Text } from "@react-email/components";
import { appHref } from "@/lib/marketing-to-app-href";
import { emailStyles } from "./styles";
import { EmailLayout } from "./layout";

type WelcomeEmailProps = Readonly<{
  email: string;
}>;

export function WelcomeEmail({ email }: WelcomeEmailProps) {
  return (
    <EmailLayout
      preview="Benvenuto in ScontrinoZero — il tuo registratore di cassa virtuale"
      header="product"
    >
      <Heading as="h2" style={emailStyles.subheading}>
        Benvenuto!
      </Heading>
      <Text style={emailStyles.text}>
        Ciao, ti scriviamo per confermare che il tuo account è stato creato con
        successo per l&apos;indirizzo <strong>{email}</strong>.
      </Text>
      <Text style={emailStyles.text}>
        ScontrinoZero è il registratore di cassa virtuale che ti permette di
        emettere scontrini elettronici e trasmettere i corrispettivi
        all&apos;Agenzia delle Entrate direttamente dal tuo smartphone.
      </Text>
      <Button
        style={emailStyles.button}
        // `appHref` segue l'override runtime `APP_HOSTNAME`: una sola
        // immagine serve prod e sandbox, e il valore bakato in
        // `NEXT_PUBLIC_APP_URL` è sempre quello di produzione
        // (PR #904). Il fallback punta al subdomain app, dove
        // la dashboard vive davvero.
        href={appHref("/dashboard")}
      >
        Vai alla dashboard
      </Button>
    </EmailLayout>
  );
}
