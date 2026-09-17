import { KpiCard } from "@/components/kpi-card";
import { formatCurrency } from "@/lib/utils";
import type {
  AdminDocumentKpis,
  AdminSparklinePoint,
  AdminUserKpis,
} from "@/server/admin-metrics";
import { AdminSparkline } from "./admin-sparkline";

// Module-scope: costruire un Intl.NumberFormat è costoso e le opzioni sono
// costanti (stesso motivo di `src/components/analytics/kpi-cards.tsx`).
const countFormatter = new Intl.NumberFormat("it-IT");

/**
 * Le cinque card del pannello amministratore, in **due gruppi**: due utenti, tre
 * scontrini.
 *
 * Il taglio segue la query che le alimenta, non l'estetica: le card utenti
 * vengono da `profiles`, quelle scontrini da `commercial_documents` (più
 * `ade_credentials` per il conteggio dei metodi di accesso). Ognuno dei due
 * gruppi sta dietro al proprio boundary Suspense, così le card utenti
 * compaiono senza aspettare la scansione dello storico scontrini. Il funnel
 * trial per periodo, che affianca queste card nella stessa griglia, ha una
 * sua lettura e un suo componente a parte (`AdminTrialFunnelCard`): tocca
 * `commercial_documents` come le card scontrini, e bloccarlo dietro lo stesso
 * boundary delle card utenti le farebbe aspettare la stessa scansione che
 * questo taglio vuole evitare.
 *
 * Entrambi rendono un **frammento**, non un contenitore: la griglia è della
 * pagina, e `<Suspense>` non produce un nodo DOM, quindi le card restano figlie
 * dirette della griglia sia da skeleton sia da contenuto.
 *
 * La card del periodo (Nuovi utenti, Scontrini, Incasso) porta il totale
 * storico come footnote: sono le due domande che si fanno insieme ("quanti
 * nuovi utenti questo mese" / "quanti in tutto") e separarle in due griglie
 * raddoppiava le card senza aggiungere informazione.
 */

interface AdminUserKpiCardsProps {
  readonly kpis: AdminUserKpis;
}

/**
 * Somma cumulata dei punti di una sparkline: il primo punto di `points`
 * diventa la base (0 + il suo valore), ogni punto successivo aggiunge il
 * proprio delta. Una sparkline di "nuovi utenti al giorno" letta così mostra
 * la curva di crescita del periodo, non l'oscillazione giorno per giorno —
 * che con un asse fiscale pieno di zeri (weekend, notti) è quasi illeggibile.
 */
function cumulative(
  points: readonly AdminSparklinePoint[],
): AdminSparklinePoint[] {
  let running = 0;
  return points.map((point) => {
    running += point.value;
    return { date: point.date, value: running };
  });
}

export function AdminUserKpiCards({ kpis }: AdminUserKpiCardsProps) {
  return (
    <>
      <KpiCard
        title="Nuovi utenti"
        value={countFormatter.format(kpis.usersInRange)}
        footnote={`${countFormatter.format(kpis.usersTotal)} in totale`}
      >
        <AdminSparkline
          points={cumulative(kpis.usersSparkline)}
          label="Andamento cumulato nuovi utenti"
        />
      </KpiCard>
      <KpiCard
        title="Trial: onboarding completato"
        value={countFormatter.format(kpis.trialsOnboarded)}
        footnote="Trial ancora attivi, credenziali AdE verificate"
      />
    </>
  );
}

interface AdminDocumentKpiCardsProps {
  readonly kpis: AdminDocumentKpis;
}

export function AdminDocumentKpiCards({ kpis }: AdminDocumentKpiCardsProps) {
  return (
    <>
      <KpiCard
        title="Scontrini"
        value={countFormatter.format(kpis.receiptsInRange)}
        footnote={`${countFormatter.format(kpis.receiptsTotal)} in totale`}
      >
        <AdminSparkline
          points={kpis.receiptsSparkline}
          label="Andamento scontrini"
        />
      </KpiCard>
      <KpiCard
        title="Incasso"
        value={formatCurrency(kpis.revenueCentsInRange / 100)}
        footnote={`${formatCurrency(kpis.revenueCentsTotal / 100)} in totale`}
      >
        <AdminSparkline
          points={kpis.revenueSparkline}
          label="Andamento incasso"
        />
      </KpiCard>
      <KpiCard
        title="Fisconline vs CIE"
        value={`${countFormatter.format(kpis.fisconlineUsers)} / ${countFormatter.format(kpis.cieUsers)}`}
        footnote="Business con credenziali AdE salvate, per metodo di accesso"
      />
    </>
  );
}
