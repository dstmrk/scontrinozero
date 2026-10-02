import { KpiCard } from "@/components/kpi-card";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsKpis } from "@/server/analytics-actions";

interface KpiCardsProps {
  readonly kpis: AnalyticsKpis;
}

function fromCents(cents: number): number {
  return cents / 100;
}

// Module-scope: costruire un Intl.NumberFormat è costoso, le opzioni sono costanti.
const countFormatter = new Intl.NumberFormat("it-IT");

function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const revenueLabel =
    kpis.count === 0 ? "—" : formatCurrency(fromCents(kpis.revenueCents));
  const countLabel = kpis.count === 0 ? "—" : formatCount(kpis.count);
  const aovLabel =
    kpis.count === 0 ? "—" : formatCurrency(fromCents(kpis.aovCents));
  const voidLabel = formatCount(kpis.voidCount);
  // I ricavi sono già al netto dei resi: la nota dice di quanto, così il
  // numero non sembra sbagliato a chi ricorda le vendite del periodo.
  const returnsNote =
    kpis.returnCount === 0
      ? undefined
      : `Al netto di ${formatCount(kpis.returnCount)} ${
          kpis.returnCount === 1 ? "reso" : "resi"
        } (${formatCurrency(fromCents(kpis.returnCents))})`;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard title="Ricavi" value={revenueLabel} footnote={returnsNote} />
      <KpiCard title="Scontrini emessi" value={countLabel} />
      <KpiCard title="Scontrino medio" value={aovLabel} />
      <KpiCard title="Scontrini annullati" value={voidLabel} />
    </div>
  );
}
