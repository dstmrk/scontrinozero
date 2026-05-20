"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  type AnalyticsKpis,
  type AnalyticsRange,
  type PaymentBreakdownEntry,
  type RevenuePoint,
  getAnalyticsKpis,
  getPaymentBreakdown,
  getRevenueTimeseries,
} from "@/server/analytics-actions";
import { KpiCards } from "./kpi-cards";
import { PaymentBreakdown } from "./payment-breakdown";
import { RevenueSparkline } from "./revenue-sparkline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsClientProps {
  readonly businessId: string;
  readonly initialRange: AnalyticsRange;
  readonly initialKpis: AnalyticsKpis;
  readonly initialTimeseries: RevenuePoint[];
  readonly initialBreakdown: PaymentBreakdownEntry[];
}

const ZERO_KPIS: AnalyticsKpis = {
  revenueCents: 0,
  count: 0,
  aovCents: 0,
  voidCount: 0,
};

export function AnalyticsClient({
  businessId,
  initialRange,
  initialKpis,
  initialTimeseries,
  initialBreakdown,
}: AnalyticsClientProps) {
  const [range, setRange] = useState<AnalyticsRange>(initialRange);
  const [kpis, setKpis] = useState<AnalyticsKpis>(initialKpis);
  const [timeseries, setTimeseries] =
    useState<RevenuePoint[]>(initialTimeseries);
  const [breakdown, setBreakdown] =
    useState<PaymentBreakdownEntry[]>(initialBreakdown);
  const [isPending, startTransition] = useTransition();
  // `latestRangeRef` traccia l'ultimo range richiesto. Se l'utente cambia
  // range due volte velocemente e la prima Promise.all risolve dopo la
  // seconda, la prima viene scartata: senza questo guard la UI mostrerebbe
  // i KPI del range precedente sopra il selettore aggiornato.
  const latestRangeRef = useRef<AnalyticsRange>(initialRange);

  function handleRangeChange(next: string) {
    if (next !== "7d" && next !== "30d" && next !== "90d") return;
    const nextRange = next;
    latestRangeRef.current = nextRange;
    setRange(nextRange);
    startTransition(async () => {
      const [k, t, b] = await Promise.all([
        getAnalyticsKpis(businessId, nextRange),
        getRevenueTimeseries(businessId, nextRange),
        getPaymentBreakdown(businessId, nextRange),
      ]);
      if (latestRangeRef.current !== nextRange) return;
      setKpis("error" in k ? ZERO_KPIS : k);
      setTimeseries(Array.isArray(t) ? t : []);
      setBreakdown(Array.isArray(b) ? b : []);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Andamento ricavi e scontrini per il periodo selezionato.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPending && (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          )}
          <Select value={range} onValueChange={handleRangeChange}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
              <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90d">Ultimi 90 giorni</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <KpiCards kpis={kpis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ricavi giornalieri</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueSparkline data={timeseries} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metodi di pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentBreakdown data={breakdown} />
        </CardContent>
      </Card>
    </div>
  );
}
