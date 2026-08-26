import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Card di un singolo KPI: etichetta, valore grande, contesto opzionale.
 *
 * Vive fuori da `analytics/` e da `admin/` perché la usano entrambi: la
 * analytics dell'esercente (`src/components/analytics/kpi-cards.tsx`) e il
 * pannello operatore (`src/components/admin/admin-kpi-cards.tsx`). Erano lo
 * stesso markup scritto due volte; la seconda copia è nata con questo
 * pannello e sarebbe divergita al primo ritocco di stile.
 *
 * Non sta in `ui/` perché non è una primitiva shadcn (quella cartella è
 * rigenerabile con `npx shadcn add`), ma un componente di prodotto.
 */
interface KpiCardProps {
  readonly title: string;
  readonly value: string;
  /** Riga di contesto sotto il valore (es. il totale storico). */
  readonly footnote?: string;
  /** Slot in coda al contenuto: sparkline, badge, qualunque extra. */
  readonly children?: React.ReactNode;
}

export function KpiCard({ title, value, footnote, children }: KpiCardProps) {
  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-semibold">{value}</p>
        {footnote && (
          <p className="text-muted-foreground text-xs">{footnote}</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
