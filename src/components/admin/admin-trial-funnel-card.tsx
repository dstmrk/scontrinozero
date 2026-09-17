import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AdminTrialFunnel } from "@/server/admin-metrics";

const countFormatter = new Intl.NumberFormat("it-IT");

/**
 * Funnel di attivazione della coorte trial del periodo: registrati →
 * onboarding completo → scontrini emessi (vedi `AdminTrialFunnel`).
 *
 * Non è un `KpiCard`: quello ha un solo valore grande e queste sono tre fasi
 * da leggere in sequenza, quindi la card è su misura invece di forzare tre
 * numeri nello slot di uno. Vive nella stessa riga di griglia delle card
 * utenti/scontrini in `src/app/admin/page.tsx`, dietro il proprio boundary
 * Suspense: la sua lettura tocca `commercial_documents` (per "ha emesso
 * scontrini") e non deve far aspettare le card utenti, che non lo fanno.
 */
interface AdminTrialFunnelCardProps {
  readonly funnel: AdminTrialFunnel;
}

function FunnelStage({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <p className="text-2xl font-semibold">{countFormatter.format(value)}</p>
      <p className="text-muted-foreground truncate text-[11px] tracking-wide uppercase">
        {label}
      </p>
    </div>
  );
}

export function AdminTrialFunnelCard({ funnel }: AdminTrialFunnelCardProps) {
  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Funnel trial (periodo)
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1">
          <FunnelStage label="Registrati" value={funnel.registered} />
          <ArrowRight
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
          <FunnelStage label="Onboarding" value={funnel.onboarded} />
          <ArrowRight
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
          <FunnelStage label="Scontrini" value={funnel.issuedReceipts} />
        </div>
      </CardContent>
    </Card>
  );
}
