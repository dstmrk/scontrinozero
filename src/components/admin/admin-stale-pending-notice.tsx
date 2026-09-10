import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StalePendingCount } from "@/lib/services/ade-recovery";

/**
 * Formatta l'attesa della riga più vecchia in giorni o ore, l'unità che si
 * legge senza fare conti. Sotto l'ora resta "meno di un'ora": la soglia stale
 * di default è 30 minuti, quindi il caso esiste.
 */
function formatAge(oldestCreatedAt: Date, now: Date): string {
  const hours = Math.floor(
    (now.getTime() - oldestCreatedAt.getTime()) / (60 * 60 * 1000),
  );
  if (hours < 1) return "meno di un'ora";
  if (hours < 48) return `${hours} ${hours === 1 ? "ora" : "ore"}`;
  return `${Math.floor(hours / 24)} giorni`;
}

/**
 * Avviso sui documenti `PENDING` fermi oltre la soglia stale.
 *
 * **Non è una card: non renderizza nulla quando il conteggio è zero.** Una
 * card che mostra "0" tutti i giorni si smette di leggere dopo una settimana,
 * ed è esattamente il difetto che questo rilevatore chiude — le righe orfane
 * non facevano rumore e nessuno le vedeva (REVIEW.md #103). Comparire solo
 * quando c'è qualcosa da guardare è la proprietà, non un dettaglio di stile.
 */
export function AdminStalePendingNotice({
  kpi,
  now = new Date(),
}: {
  readonly kpi: StalePendingCount;
  readonly now?: Date;
}) {
  const total = kpi.sale + kpi.void;
  if (total === 0) return null;

  const parts = [
    kpi.sale > 0 && `${kpi.sale} ${kpi.sale === 1 ? "vendita" : "vendite"}`,
    kpi.void > 0 && `${kpi.void} ${kpi.void === 1 ? "annullo" : "annulli"}`,
  ].filter((part): part is string => typeof part === "string");

  return (
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        <p>
          <strong>
            {total} {total === 1 ? "documento" : "documenti"} in sospeso
          </strong>{" "}
          oltre la soglia ({parts.join(", ")}): l&apos;esito su AdE resta
          ignoto.
          {kpi.oldestCreatedAt && (
            <>
              {" "}
              Il più vecchio aspetta da {formatAge(kpi.oldestCreatedAt, now)}.
            </>
          )}{" "}
          L&apos;esercente può verificarli dalla propria dashboard.
        </p>
      </AlertDescription>
    </Alert>
  );
}
