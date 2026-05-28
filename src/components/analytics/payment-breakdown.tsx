"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { PaymentBreakdownEntry } from "@/server/analytics-actions";

const METHOD_LABELS: Record<string, string> = {
  PC: "Contanti",
  PE: "Elettronico",
  other: "Altro",
};

interface PaymentBreakdownProps {
  readonly data: readonly PaymentBreakdownEntry[];
}

export function PaymentBreakdown({ data }: PaymentBreakdownProps) {
  const chartData = data.map((e) => ({
    method: METHOD_LABELS[e.method] ?? e.method,
    revenue: e.revenueCents / 100,
    count: e.count,
  }));

  if (chartData.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        Nessuno scontrino nel periodo selezionato.
      </div>
    );
  }

  const accessibleSummary = chartData
    .map((e) => `${e.method}: ${formatCurrency(e.revenue)}`)
    .join(". ");

  return (
    <div
      role="img"
      aria-label="Grafico metodi di pagamento."
      className="h-[220px] w-full"
    >
      <span className="sr-only">{accessibleSummary}</span>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="method"
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(value) => `${Math.round(value)}€`}
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value) => [
              typeof value === "number" ? formatCurrency(value) : String(value),
              "Ricavi",
            ]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
