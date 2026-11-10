import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";

/**
 * - `product`: mail all'utente con la fascia del marchio;
 * - `internal`: notifica all'operatore, con un footer che non rimanda al sito;
 * - `none`: mail sobria, senza fascia (cancellazioni, avvisi ai collaboratori).
 */
export type EmailHeader = "product" | "internal" | "none";

const HEADER_SUBTITLE: Record<Exclude<EmailHeader, "none">, string> = {
  product: "Registratore di cassa virtuale",
  internal: "Notifica interna",
};

type EmailLayoutProps = Readonly<{
  preview: string;
  header: EmailHeader;
  children: ReactNode;
}>;

/** Involucro comune di ogni mail: intestazione, corpo, footer. */
export function EmailLayout({ preview, header, children }: EmailLayoutProps) {
  return (
    <Html lang="it">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          {header !== "none" && (
            <Section style={emailStyles.header}>
              <Text style={emailStyles.headerTitle}>ScontrinoZero</Text>
              <Text style={emailStyles.headerSubtitle}>
                {HEADER_SUBTITLE[header]}
              </Text>
            </Section>
          )}
          <Section style={emailStyles.content}>{children}</Section>
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.footer}>
            {header === "internal"
              ? "ScontrinoZero · notifica automatica"
              : "ScontrinoZero · scontrinozero.it"}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Stesso link del pulsante, in chiaro: chi legge la posta in un client che
 * degrada l'HTML vedrebbe altrimenti una mail senza alcun modo di proseguire.
 */
export function EmailLinkFallback({ href }: Readonly<{ href: string }>) {
  return (
    <Text style={fallback}>
      Se il pulsante non funziona, copia questo indirizzo nel browser:
      <br />
      <Link href={href} style={fallbackLink}>
        {href}
      </Link>
    </Text>
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
