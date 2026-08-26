import type { AdminSparklinePoint } from "@/server/admin-metrics";

/**
 * Sparkline del pannello operatore: una `polyline` SVG e nulla più.
 *
 * **Perché non Recharts** (che il progetto ha già, regola 29): Recharts è un
 * client component e trascinerebbe ~90 KB di JS su una pagina che altrimenti è
 * interamente server-rendered, per disegnare tre spezzate senza assi, tooltip
 * né interazione. Il grafico ricco resta quello dell'esercente in
 * `src/components/analytics/`, dove l'interazione serve davvero.
 */

/** viewBox fisso: la scala reale la decide il CSS (`w-full h-…`). */
const WIDTH = 100;
const HEIGHT = 28;
const STROKE = 2;

interface AdminSparklineProps {
  readonly points: readonly AdminSparklinePoint[];
  /** Nome accessibile del grafico (il testo della card che lo contiene). */
  readonly label: string;
}

export function AdminSparkline({ points, label }: AdminSparklineProps) {
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;

  // Metà altezza per una serie costante (span 0): il rapporto sarebbe 0/0.
  // Vale anche per la serie tutta a zero, che è il caso normale di un range
  // senza attività — deve restare una riga piatta, non sparire.
  const usable = HEIGHT - STROKE;
  const y = (value: number) =>
    span === 0 ? HEIGHT / 2 : STROKE / 2 + usable * (1 - (value - min) / span);
  // Un solo punto: niente denominatore, si disegna al centro.
  const x = (index: number) =>
    points.length === 1 ? WIDTH / 2 : (WIDTH * index) / (points.length - 1);

  const path = points
    .map(
      (point, index) => `${x(index).toFixed(2)},${y(point.value).toFixed(2)}`,
    )
    .join(" ");

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="text-primary/70 h-7 w-full"
    >
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
