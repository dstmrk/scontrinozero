import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BILLING_SETTINGS_HREF,
  canUsePro,
  type Plan,
} from "@/lib/plans-shared";

interface ProFeatureGateProps {
  /**
   * Server prop: il valore proviene da `getPlan()` lato server. Per riflettere
   * un upgrade post-checkout Stripe (mid-sessione, altra tab gia' aperta) la
   * pagina deve essere re-renderizzata server-side via `router.refresh()`,
   * page reload o redirect. Il componente NON osserva eventi di upgrade da
   * solo. Vedi `RefreshOnSuccess` montato su `/dashboard/settings?success=1`
   * per il pattern di invalidation cross-tab della cache RSC client.
   */
  readonly plan: Plan;
  /**
   * Server prop da `getPlan()`: se il piano è `trial` e non scaduto, l'utente
   * è trattato come Pro (assaggio feature Pro durante la prova). Omesso/null →
   * il trial resta gated (mostra l'upsell).
   */
  readonly trialStartedAt?: Date | null;
  readonly children: React.ReactNode;
  readonly title?: string;
  readonly description?: string;
}

const DEFAULT_TITLE = "Disponibile sul piano Pro";
const DEFAULT_DESCRIPTION =
  "Questa funzionalità è inclusa nel piano Pro. Passa a Pro per sbloccarla.";

export function ProFeatureGate({
  plan,
  trialStartedAt = null,
  children,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
}: ProFeatureGateProps) {
  if (canUsePro(plan, null, trialStartedAt)) {
    return <>{children}</>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={BILLING_SETTINGS_HREF}>Passa a Pro</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
