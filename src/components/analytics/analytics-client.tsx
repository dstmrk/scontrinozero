"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  type AnalyticsKpis,
  type AnalyticsRange,
  type PaymentBreakdownEntry,
  type ProductBreakdownEntry,
  type RevenuePoint,
  getAnalyticsBundle,
} from "@/server/analytics-actions";
import { KpiCards } from "./kpi-cards";
import { PaymentBreakdown } from "./payment-breakdown";
import { ProductBreakdown } from "./product-breakdown";
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
  readonly initialProductBreakdown: ProductBreakdownEntry[];
  readonly initialLoadFailed?: boolean;
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
  initialProductBreakdown,
  initialLoadFailed = false,
}: AnalyticsClientProps) {
  const [range, setRange] = useState<AnalyticsRange>(initialRange);
  const [kpis, setKpis] = useState<AnalyticsKpis>(initialKpis);
  const [timeseries, setTimeseries] =
    useState<RevenuePoint[]>(initialTimeseries);
  const [breakdown, setBreakdown] =
    useState<PaymentBreakdownEntry[]>(initialBreakdown);
  const [productBreakdown, setProductBreakdown] = useState<
    ProductBreakdownEntry[]
  >(initialProductBreakdown);
  const [loadFailed, setLoadFailed] = useState<boolean>(initialLoadFailed);
  const [isPending, startTransition] = useTransition();
  // `latestRangeRef` traccia l'ultimo range richiesto. Se l'utente cambia
  // range due volte velocemente e la prima Promise risolve dopo la
  // seconda, la prima viene scartata: senza questo guard la UI mostrerebbe
  // i KPI del range precedente sopra il selettore aggiornato.
  const latestRangeRef = useRef<AnalyticsRange>(initialRange);

  function handleRangeChange(next: string) {
    if (next !== "7d" && next !== "30d" && next !== "90d" && next !== "ytd")
      return;
    const nextRange = next;
    latestRangeRef.current = nextRange;
    setRange(nextRange);
    startTransition(async () => {
      const result = await getAnalyticsBundle(businessId, nextRange);
      if (latestRangeRef.current !== nextRange) return;
      if ("error" in result) {
        setKpis(ZERO_KPIS);
        setTimeseries([]);
        setBreakdown([]);
        setProductBreakdown([]);
        setLoadFailed(true);
        return;
      }
      setKpis(result.kpis);
      setTimeseries(result.timeseries);
      setBreakdown(result.breakdown);
      setProductBreakdown(result.productBreakdown);
      setLoadFailed(false);
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
              <SelectItem value="ytd">Da inizio anno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loadFailed && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          Impossibile caricare alcuni dati. Riprova tra qualche istante.
        </div>
      )}

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Prodotti e servizi più venduti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProductBreakdown data={productBreakdown} />
        </CardContent>
      </Card>
    </div>
  );
}
