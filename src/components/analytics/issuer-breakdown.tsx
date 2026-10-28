import { formatCurrency } from "@/lib/utils";
import type { IssuerBreakdownEntry } from "@/server/analytics-actions";

/**
 * La ripartizione dice qualcosa solo se oltre al titolare ha emesso qualcun
 * altro: un collaboratore o la Developer API. Con il solo titolare sarebbe la
 * copia del KPI dei ricavi.
 */
export function hasIssuersBesidesOwner(
  data: readonly IssuerBreakdownEntry[],
): boolean {
  return data.some((entry) => entry.kind !== "owner");
}

/**
 * Ricavi e scontrini per chi ha emesso (issue #1099). Una tabella e non un
 * grafico: le voci sono poche e si leggono per nome, e il componente resta
 * fuori dal chunk di recharts.
 */
export function IssuerBreakdown({
  data,
}: Readonly<{ data: readonly IssuerBreakdownEntry[] }>) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th scope="col" className="pb-2 font-medium">
            Emesso da
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Scontrini
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Ricavi
          </th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry) => (
          <tr key={entry.key} className="border-t">
            <td className="py-2">{entry.label}</td>
            <td className="py-2 text-right tabular-nums">{entry.count}</td>
            <td className="py-2 text-right tabular-nums">
              {formatCurrency(entry.revenueCents / 100)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
