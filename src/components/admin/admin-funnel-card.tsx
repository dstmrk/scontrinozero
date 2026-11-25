import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  AdminFunnel,
  AdminFunnelStage,
  AdminLoginMethod,
} from "@/server/admin-metrics";

const countFormatter = new Intl.NumberFormat("it-IT");
const percentFormatter = new Intl.NumberFormat("it-IT", {
  style: "percent",
  maximumFractionDigits: 0,
});

/**
 * Etichetta lunga per la legenda, sigla per la riga del gradino: su mobile la
 * riga sta sotto la barra e tre nomi per esteso la manderebbero a capo.
 */
const METHODS: Readonly<
  Record<
    AdminLoginMethod,
    { readonly label: string; readonly short: string; readonly swatch: string }
  >
> = {
  fisconline: { label: "Fisconline", short: "F", swatch: "bg-chart-1" },
  cie: { label: "CIE", short: "C", swatch: "bg-chart-4" },
  spid: { label: "SPID", short: "S", swatch: "bg-chart-3" },
};

/**
 * Ordine di disegno, preso dalla mappa qui sopra: è tipata su tutti i
 * metodi, quindi un metodo nuovo che manca qui non compila. Importarlo da
 * `admin-metrics.ts` trascinerebbe nel componente un modulo che parla col DB.
 */
const METHOD_ORDER = Object.keys(METHODS) as AdminLoginMethod[];

/** Quota di `part` su `whole` in percentuale CSS, 0 se `whole` è vuoto. */
function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

interface FunnelRowProps {
  readonly label: string;
  /** Larghezza della barra: sempre rispetto ai registrati, il gradino 100%. */
  readonly widthOf: number;
  readonly total: number;
  readonly children?: React.ReactNode;
  readonly bar: React.ReactNode;
}

function FunnelRow({ label, widthOf, total, bar, children }: FunnelRowProps) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[7rem_1fr_10rem]">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="bg-muted relative h-6 overflow-hidden rounded-md">
        <div
          className="flex h-full overflow-hidden rounded-md"
          style={{ width: `${share(total, widthOf)}%` }}
        >
          {bar}
        </div>
        <span className="absolute inset-y-0 left-2 flex items-center text-sm font-semibold text-white [text-shadow:0_0_2px_rgb(0_0_0/0.4)]">
          {countFormatter.format(total)}
        </span>
      </div>
      <span className="text-muted-foreground col-start-2 text-xs whitespace-nowrap sm:col-start-3">
        {children}
      </span>
    </div>
  );
}

interface StageRowProps {
  readonly label: string;
  readonly stage: AdminFunnelStage;
  readonly previous: number;
  readonly registered: number;
}

/**
 * Un gradino dopo il primo: la barra è divisa per metodo di accesso, la
 * percentuale è sul gradino precedente. La parte non coperta dai metodi
 * (onboarding completato, credenziali poi cancellate) resta neutra invece di
 * sparire: la barra deve misurare il totale, non la somma dei metodi.
 */
function StageRow({ label, stage, previous, registered }: StageRowProps) {
  const split = METHOD_ORDER.filter((method) => stage.methods[method] > 0);
  return (
    <FunnelRow
      label={label}
      widthOf={registered}
      total={stage.total}
      bar={
        <>
          {split.map((method) => (
            <div
              key={method}
              data-method={method}
              className={METHODS[method].swatch}
              style={{ width: `${share(stage.methods[method], stage.total)}%` }}
            />
          ))}
          <div className="bg-muted-foreground/40 flex-1" />
        </>
      }
    >
      <span className="text-foreground font-semibold">
        {percentFormatter.format(previous > 0 ? stage.total / previous : 0)}
      </span>
      {split.length > 0 && " · "}
      {split
        .map(
          (method) =>
            `${countFormatter.format(stage.methods[method])} ${METHODS[method].short}`,
        )
        .join(" / ")}
    </FunnelRow>
  );
}

interface AdminFunnelCardProps {
  readonly funnel: AdminFunnel;
}

/**
 * Funnel di sempre: registrati → onboarding → scontrini → paganti, con il
 * metodo di accesso AdE dentro ogni barra (vedi `AdminFunnel`).
 *
 * Barre in HTML e CSS, senza libreria di grafici: sono quattro rettangoli, e
 * il pannello resta senza JavaScript oltre al selettore di periodo. La SPID
 * compare in legenda solo se qualcuno la usa: oggi è un metodo raro, e una
 * voce sempre a zero sarebbe rumore.
 */
export function AdminFunnelCard({ funnel }: AdminFunnelCardProps) {
  const { registered, onboarded, issuedReceipts, paying } = funnel;
  const legend = METHOD_ORDER.filter(
    (method) => method !== "spid" || onboarded.methods.spid > 0,
  );

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Funnel · dall&apos;inizio
        </p>
        <ul className="text-muted-foreground flex gap-3 text-xs">
          {legend.map((method) => (
            <li key={method} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-sm", METHODS[method].swatch)}
              />
              {METHODS[method].label}
            </li>
          ))}
        </ul>
      </CardHeader>
      <CardContent className="space-y-3">
        <FunnelRow
          label="Registrati"
          widthOf={registered}
          total={registered}
          bar={<div className="bg-muted-foreground/40 flex-1" />}
        />
        <StageRow
          label="Onboarding"
          stage={onboarded}
          previous={registered}
          registered={registered}
        />
        <StageRow
          label="Con scontrini"
          stage={issuedReceipts}
          previous={onboarded.total}
          registered={registered}
        />
        <StageRow
          label="Paganti"
          stage={paying}
          previous={issuedReceipts.total}
          registered={registered}
        />
        {funnel.payingWithoutReceipts > 0 && (
          <p className="text-muted-foreground text-xs">
            Fuori dal funnel:{" "}
            {countFormatter.format(funnel.payingWithoutReceipts)}{" "}
            {funnel.payingWithoutReceipts === 1
              ? "pagante senza scontrini"
              : "paganti senza scontrini"}
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
