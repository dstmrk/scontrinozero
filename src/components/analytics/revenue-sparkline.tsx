"use client";

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
  const chartData = data.map((p) => ({
    date: p.date,
    revenue: p.revenueCents / 100,
  }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <XAxis
            dataKey="date"
            tickFormatter={(value) => formatDate(value, "2-digit")}
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
                ? formatDate(value)
                : String(value ?? "")
            }
            formatter={(value) => [
              typeof value === "number" ? formatCurrency(value) : String(value),
              "Ricavi",
            ]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.08)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="hsl(var(--primary, 220 90% 56%))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
