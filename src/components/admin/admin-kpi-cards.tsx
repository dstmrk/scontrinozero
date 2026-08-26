import { KpiCard } from "@/components/kpi-card";
import { formatCurrency } from "@/lib/utils";
import type { AdminKpis } from "@/server/admin-metrics";
import { AdminSparkline } from "./admin-sparkline";

// Module-scope: costruire un Intl.NumberFormat è costoso e le opzioni sono
// costanti (stesso motivo di `src/components/analytics/kpi-cards.tsx`).
const countFormatter = new Intl.NumberFormat("it-IT");
const percentFormatter = new Intl.NumberFormat("it-IT", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

interface AdminKpiCardsProps {
  readonly kpis: AdminKpis;
}

/**
 * Le sei card del pannello operatore.
 *
 * Ogni card del periodo porta il totale storico come footnote: sono le due
 * domande che si fanno insieme ("quanti nuovi utenti questo mese" / "quanti in
 * tutto") e separarle in due griglie raddoppiava le card senza aggiungere
 * informazione.
 */
export function AdminKpiCards({ kpis }: AdminKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <KpiCard
        title="Nuovi utenti"
        value={countFormatter.format(kpis.usersInRange)}
        footnote={`${countFormatter.format(kpis.usersTotal)} in totale`}
      >
        <AdminSparkline
          points={kpis.usersSparkline}
          label="Andamento nuovi utenti"
        />
      </KpiCard>
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
      <KpiCard
        title="Trial attivi"
        value={countFormatter.format(kpis.trialsActive)}
        footnote="Bonus referral incluso"
      />
      <KpiCard
        title="Conversione trial"
        value={percentFormatter.format(kpis.trialConversionRate)}
        footnote="Trial partiti negli ultimi 90 giorni"
      />
      <KpiCard
        title="Annullati"
        value={countFormatter.format(kpis.voidedInRange)}
        footnote="Scontrini annullati nel periodo"
      />
    </div>
  );
}
