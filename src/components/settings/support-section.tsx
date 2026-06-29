import { ExternalLink, Mail } from "lucide-react";
import { buildSupportMailtoHref } from "@/lib/contact";

/**
 * Contenuto della card "Supporto" delle impostazioni: rende l'Help Center e una
 * email pre-compilata. Componente presentazionale puro (nessun hook), così è
 * renderizzabile nel server component `settings/page.tsx` e testabile con
 * `render()`.
 *
 * Il link al Centro assistenza usa un path RELATIVO `/help/contatto-assistenza`:
 * dal dominio app il middleware (`hostnameRedirect`, src/proxy.ts) fa l'hop
 * cross-origin verso il dominio marketing. Stesso pattern di
 * `ade-credentials-section.tsx`. La regola 15 (`appHref`) riguarda i link
 * auth marketing→app, non questo verso opposto.
 */
export function SupportSection({
  accountEmail,
  plan,
  appVersion,
}: {
  readonly accountEmail: string | null | undefined;
  readonly plan: string | null | undefined;
  readonly appVersion: string;
}) {
  const mailtoHref = buildSupportMailtoHref({ accountEmail, plan, appVersion });

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Hai bisogno di aiuto? Consulta il Centro assistenza per le domande
        frequenti, oppure scrivici via email: ti rispondiamo nei tempi indicati
        in base al tuo piano.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="/help/contatto-assistenza"
          className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Centro assistenza
        </a>
        <a
          href={mailtoHref}
          className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Scrivici via email
        </a>
      </div>
    </div>
  );
}
