"use client";

import { useId } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RevenuePoint } from "@/server/analytics-actions";

interface RevenueSparklineProps {
  readonly data: readonly RevenuePoint[];
}

export function RevenueSparkline({ data }: RevenueSparklineProps) {
  // Vedi product-breakdown.tsx per la motivazione di aria-describedby:
  // role="img" rende i discendenti non navigabili dagli AT.
  // useId DEVE essere chiamato prima di qualsiasi early return.
  const summaryId = useId();
  const chartData = data.map((p) => ({
    date: p.date,
    revenue: p.revenueCents / 100,
  }));

  if (chartData.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        Nessuno scontrino nel periodo selezionato.
      </div>
    );
  }

  const accessibleSummary = chartData
    .map(
      (p) =>
        `${formatDate(p.date, "numeric", "Europe/Rome")}: ${formatCurrency(p.revenue)}`,
    )
    .join(". ");

  return (
    <div
      role="img"
      aria-label="Grafico ricavi giornalieri."
      aria-describedby={summaryId}
      className="h-[220px] w-full"
    >
      <span id={summaryId} className="sr-only">
        {accessibleSummary}
      </span>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <XAxis
            dataKey="date"
            tickFormatter={(value) =>
              formatDate(value, "2-digit", "Europe/Rome")
            }
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
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
            labelFormatter={(value) =>
              typeof value === "string"
                ? formatDate(value, "numeric", "Europe/Rome")
                : String(value ?? "")
            }
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
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
