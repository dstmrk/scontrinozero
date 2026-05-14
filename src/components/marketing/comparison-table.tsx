import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

export interface ComparisonRow {
  readonly label: string;
  readonly competitor: string | boolean;
  readonly ours: string | boolean;
  readonly note?: string;
}

interface ComparisonTableProps {
  readonly competitorLabel: string;
  readonly rows: readonly ComparisonRow[];
  readonly oursLabel?: string;
  readonly footer?: {
    readonly label: string;
    readonly value: string;
  };
}

function renderCell(
  value: string | boolean,
  variant: "competitor" | "ours",
): ReactNode {
  if (typeof value === "string") return value;
  if (value) return <Check className="mx-auto h-4 w-4" />;
  const xClassName =
    variant === "competitor"
      ? "mx-auto h-4 w-4 text-red-400"
      : "text-muted-foreground mx-auto h-4 w-4";
  return <X className={xClassName} />;
}

export function ComparisonTable({
  competitorLabel,
  rows,
  oursLabel = "ScontrinoZero",
  footer,
}: ComparisonTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-4 py-3 text-left font-semibold"></th>
            <th className="px-4 py-3 text-center font-semibold">
              {competitorLabel}
            </th>
            <th className="text-primary px-4 py-3 text-center font-semibold">
              {oursLabel}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-4 py-3">
                {row.label}
                {row.note && (
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {row.note}
                  </span>
                )}
              </td>
              <td className="text-muted-foreground px-4 py-3 text-center">
                {renderCell(row.competitor, "competitor")}
              </td>
              <td className="text-primary px-4 py-3 text-center font-semibold">
                {renderCell(row.ours, "ours")}
              </td>
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="px-4 py-3">{footer.label}</td>
              <td className="px-4 py-3 text-center"></td>
              <td className="text-primary px-4 py-3 text-center">
                {footer.value}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
