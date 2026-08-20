import { ExternalLink, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BILLING_SETTINGS_HREF,
  canUseApi,
  type Plan,
} from "@/lib/plans-shared";
import { ApiKeySection } from "./api-key-section";

/**
 * Card "API key" delle impostazioni. Rende la gestione chiavi a chi ha
 * accesso e un upsell a chi non ce l'ha — la card c'e' SEMPRE.
 *
 * Perche' non nasconderla: prima il gate viveva in `settings/page.tsx` e la
 * card spariva del tutto sui piani senza API. Chi era in prova non aveva modo
 * di sapere che la Developer API esistesse (ci e' arrivata una mail di un
 * utente che la cercava), e l'upsell andava perso. Stesso principio di
 * `ProFeatureGate`, che qui non e' riusabile perche' gira su `canUsePro` e
 * lascerebbe fuori i piani `developer_*`.
 *
 * Presentazionale puro: nessun hook, cosi' resta renderizzabile dal server
 * component della pagina e testabile con `render()`. Il link alla doc usa un
 * path relativo — dal dominio app l'hop cross-origin lo fa il middleware
 * (stesso pattern di `support-section.tsx`).
 */
export function ApiKeyCard({
  businessId,
  plan,
  planExpiresAt,
  trialStartedAt,
}: {
  readonly businessId: string;
  readonly plan: Plan;
  readonly planExpiresAt: Date | null;
  readonly trialStartedAt: Date | null;
}) {
  const unlocked = canUseApi(plan, planExpiresAt, trialStartedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Emetti e annulla scontrini dal tuo gestionale o dal tuo e-commerce con
          la Developer API.{" "}
          <a
            href="/help/api"
            className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
          >
            Documentazione
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </p>

        {unlocked ? (
          <>
            {plan === "trial" && (
              <p className="text-muted-foreground text-sm">
                Al termine della prova le chiavi create ora smettono di
                funzionare: passando a Pro tornano attive senza doverle
                rigenerare.
              </p>
            )}
            <ApiKeySection businessId={businessId} />
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              L&apos;accesso alle API è incluso nel piano Pro e nella prova
              gratuita.
            </p>
            <a
              href={BILLING_SETTINGS_HREF}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Passa a Pro
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
