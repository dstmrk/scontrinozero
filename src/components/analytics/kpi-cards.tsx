import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { AnalyticsKpis } from "@/server/analytics-actions";

interface KpiCardsProps {
  readonly kpis: AnalyticsKpis;
}

function fromCents(cents: number): number {
  return cents / 100;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

interface KpiCardProps {
  readonly title: string;
  readonly value: string;
}

function KpiCard({ title, value }: KpiCardProps) {
  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const revenueLabel =
    kpis.count === 0 ? "—" : formatCurrency(fromCents(kpis.revenueCents));
  const countLabel = kpis.count === 0 ? "—" : formatCount(kpis.count);
  const aovLabel =
    kpis.count === 0 ? "—" : formatCurrency(fromCents(kpis.aovCents));
  const voidLabel = formatCount(kpis.voidCount);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard title="Ricavi" value={revenueLabel} />
      <KpiCard title="Scontrini emessi" value={countLabel} />
      <KpiCard title="Scontrino medio" value={aovLabel} />
      <KpiCard title="Scontrini annullati" value={voidLabel} />
    </div>
  );
}
