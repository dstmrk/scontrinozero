"use client";

import { useId } from "react";
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
import type { ProductBreakdownEntry } from "@/server/analytics-actions";

interface ProductBreakdownProps {
  readonly data: readonly ProductBreakdownEntry[];
}

const LABEL_MAX_CHARS = 10;

function truncate(label: string): string {
  if (label.length <= LABEL_MAX_CHARS) return label;
  return `${label.slice(0, LABEL_MAX_CHARS - 1)}…`;
}

export function ProductBreakdown({ data }: ProductBreakdownProps) {
  // role="img" expone l'elemento come singola immagine: gli AT trattano i
  // discendenti come parte del grafico e non li navigano come testo. Per
  // far annunciare il summary serve agganciarlo via aria-describedby a un
  // id stabile (utile anche se renderizziamo più widget nella stessa pagina).
  // useId DEVE essere chiamato prima di qualsiasi early return.
  const summaryId = useId();
  const chartData = data.map((e) => ({
    description: e.description,
    revenue: e.revenueCents / 100,
    count: e.count,
  }));

  if (chartData.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[260px] items-center justify-center text-sm">
        Nessun prodotto venduto nel periodo selezionato.
      </div>
    );
  }

  const accessibleSummary = data
    .map((e) => `${e.description}: ${formatCurrency(e.revenueCents / 100)}`)
    .join(". ");

  return (
    <div
      role="img"
      aria-label={`Grafico ricavi per prodotto. Top ${data.length} prodotti del periodo selezionato.`}
      aria-describedby={summaryId}
      className="h-[260px] w-full"
    >
      <span id={summaryId} className="sr-only">
        {accessibleSummary}
      </span>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 12, left: 0, bottom: 28 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="description"
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={50}
            tickFormatter={truncate}
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
            labelFormatter={(label) =>
              typeof label === "string" ? label : String(label)
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
          <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
