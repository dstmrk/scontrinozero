import { KpiCard } from "@/components/kpi-card";
import { formatCurrency } from "@/lib/utils";
import type { AdminTrialActive } from "@/server/admin-directory";
import type {
  AdminDocumentKpis,
  AdminSparklinePoint,
  AdminUserKpis,
} from "@/server/admin-metrics";
import { AdminSparkline } from "./admin-sparkline";

// Module-scope: costruire un Intl.NumberFormat è costoso e le opzioni sono
// costanti (stesso motivo di `src/components/analytics/kpi-cards.tsx`).
const countFormatter = new Intl.NumberFormat("it-IT");

/**
 * Le card numeriche del pannello amministratore.
 *
 * `AdminTrialActiveKpiCard` sta in cima alla pagina, accanto al funnel.
 * `AdminUserKpiCards` e `AdminDocumentKpiCards` sono le card del periodo, nella
 * sezione "Altre metriche": il taglio segue la query che le alimenta
 * (`profiles` per gli utenti, `commercial_documents` per gli scontrini).
 *
 * Le card del periodo portano il totale storico come footnote: sono le due
 * domande che si fanno insieme ("quanti nuovi utenti questo mese" / "quanti in
 * tutto") e separarle raddoppiava le card senza aggiungere informazione.
 */

interface AdminUserKpiCardsProps {
  readonly kpis: AdminUserKpis;
}

/**
 * Somma cumulata dei punti di una sparkline: il primo punto di `points`
 * diventa la base (0 + il suo valore), ogni punto successivo aggiunge il
 * proprio delta. Una sparkline di "nuovi utenti al giorno" letta così mostra
 * la curva di crescita del periodo, non l'oscillazione giorno per giorno —
 * che con un asse fiscale pieno di zeri (weekend, notti) è quasi illeggibile.
 */
function cumulative(
  points: readonly AdminSparklinePoint[],
): AdminSparklinePoint[] {
  let running = 0;
  return points.map((point) => {
    running += point.value;
    return { date: point.date, value: running };
  });
}

export function AdminUserKpiCards({ kpis }: AdminUserKpiCardsProps) {
  return (
    <>
      <KpiCard
        title="Nuovi utenti"
        value={countFormatter.format(kpis.usersInRange)}
        footnote={`${countFormatter.format(kpis.usersTotal)} in totale`}
      >
        <AdminSparkline
          points={cumulative(kpis.usersSparkline)}
          label="Andamento cumulato nuovi utenti"
        />
      </KpiCard>
    </>
  );
}

interface AdminDocumentKpiCardsProps {
  readonly kpis: AdminDocumentKpis;
}

export function AdminDocumentKpiCards({ kpis }: AdminDocumentKpiCardsProps) {
  return (
    <>
      <KpiCard
        title="Scontrini"
        value={countFormatter.format(kpis.receiptsInRange)}
        footnote={`${countFormatter.format(kpis.receiptsTotal)} in totale`}
      >
        <AdminSparkline
          points={kpis.receiptsSparkline}
          label="Andamento scontrini"
        />
      </KpiCard>
      <KpiCard
        title="Incasso"
        value={formatCurrency(kpis.revenueCentsInRange / 100)}
        footnote={`${formatCurrency(kpis.revenueCentsTotal / 100)} in totale`}
      >
        <AdminSparkline
          points={kpis.revenueSparkline}
          label="Andamento incasso"
        />
      </KpiCard>
    </>
  );
}

const percentFormatter = new Intl.NumberFormat("it-IT", {
  style: "percent",
  maximumFractionDigits: 0,
});

interface AdminTrialActiveKpiCardProps {
  readonly trials: Pick<AdminTrialActive, "active" | "withReceipts">;
}

/**
 * Trial attivi adesso, e la quota che ha già emesso almeno uno scontrino. La
 * barra rende leggibile a colpo d'occhio la quota, che è il numero su cui si
 * agisce: un trial senza scontrini a metà prova è da richiamare.
 */
export function AdminTrialActiveKpiCard({
  trials,
}: AdminTrialActiveKpiCardProps) {
  const ratio = trials.active > 0 ? trials.withReceipts / trials.active : 0;
  return (
    <KpiCard title="Trial attivi" value={countFormatter.format(trials.active)}>
      <div
        role="meter"
        aria-label="Trial attivi con almeno uno scontrino"
        aria-valuemin={0}
        aria-valuemax={trials.active}
        aria-valuenow={trials.withReceipts}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className="bg-chart-1 h-full"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-semibold">
          {countFormatter.format(trials.withReceipts)}
        </span>{" "}
        {trials.withReceipts === 1 ? "ha" : "hanno"} emesso almeno uno scontrino
        ({percentFormatter.format(ratio)})
      </p>
    </KpiCard>
  );
}
